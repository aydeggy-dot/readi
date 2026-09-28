"""One `EvaluateAnswerRequest` per answer, built the way the API builds a real one.

The point of going through the contract rather than calling the prompt renderer directly is that the
harness then measures the **thing that runs**: the same Pydantic model, the same `criteria_block`,
the
same three gates in `evaluation/service.py`, the same retry loop. A harness that assembled its own
prompt would drift from production in exactly the way that makes an eval reassuring and useless.

Two decisions about what a synthetic case says it is:

- **`asked_about` is true for every criterion.** The stress answers are written as one uninterrupted
  answer to the opening prompt, and their expected scores cover the whole rubric — so the interview
  they describe is one where every criterion was put to the candidate. Sending `false` would ask the
  model to score an answer while telling it the question was never asked, which is a different
  measurement (and one that belongs in a case written for it).
- **The exchange is two turns: the question as written, then the answer.** No follow-ups, because a
  stress answer is not a transcript — it is what one candidate said when asked once. That makes the
  prompting adjustment and the not-assessed exclusion (`scoring.ts`) inapplicable here by
  construction, which is right: those are decisions about an *interview*, and this measures a
  reading.
"""

from readi_worker.contracts import (
    EvaluateAnswerRequest,
    EvaluationCriterion,
    EvaluationQuestion,
    EvaluationTurn,
)
from readi_worker.evals.dataset import Case, synthetic_id


def evaluation_request(case: Case, position: int = 0) -> EvaluateAnswerRequest:
    """The request the worker would receive for this answer."""
    return EvaluateAnswerRequest.model_validate(
        {
            # Deterministic, so a case has the same trace identity across runs and models, and so
            # nothing invents a real account's id. Both are opaque and reach no prompt (ADR-0008).
            "session_id": str(synthetic_id("session", case.rubric.slug, case.kind)),
            "user_id": str(synthetic_id("user", case.role)),
            "position": position,
            "question": question_of(case).model_dump(mode="json"),
            "exchange": [turn.model_dump(mode="json") for turn in exchange_of(case)],
        }
    )


def question_of(case: Case) -> EvaluationQuestion:
    return EvaluationQuestion.model_validate(
        {
            "slug": case.question.slug,
            "type": case.question.type,
            "topic": {
                "id": str(synthetic_id("topic", case.question.topic_slug)),
                "slug": case.question.topic_slug,
                "name": case.question.topic_name,
                "description": None,
            },
            "prompt": case.question.prompt,
            "context": case.question.context,
            "ideal_points": list(case.question.ideal_points),
            "rubric": {
                "slug": case.rubric.slug,
                "name": case.rubric.name,
                "criteria": [
                    EvaluationCriterion.model_validate(
                        {
                            "position": criterion.position,
                            "dimension": criterion.dimension,
                            "description": criterion.description,
                            "levels": criterion.levels,
                            # See the module docstring. No weight: the model is never given one.
                            "asked_about": True,
                        }
                    ).model_dump(mode="json")
                    for criterion in case.rubric.criteria
                ],
            },
        }
    )


def exchange_of(case: Case) -> list[EvaluationTurn]:
    return [
        EvaluationTurn.model_validate(
            {
                "kind": "text",
                "seq": 0,
                "speaker": "interviewer",
                "follow_up_index": None,
                "text": case.question.prompt,
            }
        ),
        EvaluationTurn.model_validate(
            {
                "kind": "text",
                "seq": 1,
                "speaker": "candidate",
                "follow_up_index": None,
                "text": case.text,
            }
        ),
    ]

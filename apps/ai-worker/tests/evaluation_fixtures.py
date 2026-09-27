"""Fixtures for the evaluator: one question, its rubric, and an answer worth scoring.

The answer is written the way a candidate on this product actually writes: spoken, unpunctuated
in places, and in Nigerian English. The evidence verifier's whole job is to be fair to that, and a
fixture in polished textbook prose would never test it.
"""

from typing import Any

from readi_worker.contracts import AiCallRecord, EvaluateAnswerRequest, EvaluateAnswerResponse
from readi_worker.evaluation.calls import AnswerReading, CriterionReading, Evaluator
from readi_worker.evaluation.service import EvaluationService
from readi_worker.llm.fake import ScriptedLLMClient, Step
from readi_worker.tracing import NullTracer

SESSION_ID = "9e1c6b42-8f1a-4f1e-9d3a-2c5b7e4a1f00"
USER_ID = "3b7d2a91-4c5e-4a2b-8e6f-1d9c0a5b3e77"

DIMENSION_0 = "Looks at what actually ran"
DIMENSION_1 = "Recognises the pattern"

#: Deliberately long enough that a verbatim stretch of it trips `MIN_DESCRIPTOR_ECHO`.
DESCRIPTOR_3 = "Finds the queries the request actually made, counted or traced, and reads a plan"

#: A real answer: spoken, in Nigerian English, without the punctuation a hurried typist leaves out.
ANSWER = (
    "Okay so first thing, I no trust my laptop, because on my laptop the database dey localhost "
    "so everything go fast. I go open the trace for that endpoint in production and count how many "
    "queries one request dey make. My guess is e no be one query, e be like twenty-one, one for "
    "the list and then one for every row because the serializer dey touch a relation lazily"
)
FOLLOW_UP_ANSWER = "Wetin I go do na to load the relation upfront with a join, one query"


def criterion(position: int, dimension: str, *, asked_about: bool = True) -> dict[str, Any]:
    return {
        "position": position,
        "dimension": dimension,
        "asked_about": asked_about,
        "description": "Inspects the queries and their plans rather than reasoning from the code.",
        "levels": {
            "0": "Guesses at a cause and starts changing code.",
            "1": "Looks anywhere but at what ran.",
            "2": "Logs the queries but never looks at what any of them cost.",
            "3": DESCRIPTOR_3,
            "4": "As 3, and says why the development dataset would not have shown it.",
        },
    }


def request(
    *,
    exchange: list[dict[str, Any]] | None = None,
    criteria: list[dict[str, Any]] | None = None,
    context: str | None = None,
    ideal_points: list[str] | None = None,
) -> EvaluateAnswerRequest:
    return EvaluateAnswerRequest.model_validate(
        {
            "session_id": SESSION_ID,
            "user_id": USER_ID,
            "position": 1,
            "question": {
                "slug": "n-plus-one-diagnosis",
                "type": "technical",
                "topic": {
                    "id": "6f2c1d84-9b3e-4c7a-8f5d-0e1a2b3c4d5e",
                    "slug": "databases",
                    "name": "Databases",
                    "description": "Queries and what they cost.",
                },
                "prompt": "An endpoint takes three seconds in production. What do you do?",
                "context": context,
                "ideal_points": ideal_points
                if ideal_points is not None
                else ["Counts the queries one request makes."],
                "rubric": {
                    "slug": "query-performance-diagnosis",
                    "name": "Diagnosing a slow query path",
                    "criteria": criteria or [criterion(0, DIMENSION_0), criterion(1, DIMENSION_1)],
                },
            },
            "exchange": exchange if exchange is not None else default_exchange(),
        }
    )


def turn(seq: int, speaker: str, text: str, follow_up_index: int | None = None) -> dict[str, Any]:
    return {
        "kind": "text",
        "seq": seq,
        "speaker": speaker,
        "follow_up_index": follow_up_index,
        "text": text,
    }


def default_exchange() -> list[dict[str, Any]]:
    return [
        turn(
            0, "interviewer", "Say an endpoint takes three seconds in production. What do you do?"
        ),
        turn(1, "candidate", ANSWER),
        turn(2, "interviewer", "And what would you change?", follow_up_index=0),
        turn(3, "candidate", FOLLOW_UP_ANSWER, follow_up_index=0),
    ]


def reading(**overrides: Any) -> AnswerReading:
    """A reading that passes every gate, so a test can break exactly one thing."""
    base: dict[str, Any] = {
        "criteria": [
            CriterionReading(
                criterion=0,
                reasoning="You went to production and counted what the request really made.",
                evidence=["I go open the trace for that endpoint in production and count how many"],
                score=3,
            ),
            CriterionReading(
                criterion=1,
                reasoning="You named the shape of it and why it costs what it costs.",
                evidence=["e be like twenty-one, one for the list and then one for every row"],
                score=3,
            ),
        ],
        "covered_points": ["Counted the queries"],
        "missing_points": ["Did not say what a join then over-fetches"],
        "strengths": ["Went and looked instead of guessing"],
        "improvement_tip": "Say what the fix costs elsewhere, not only that it works.",
        "red_flags": [],
        "confidence": "high",
    }
    return AnswerReading.model_validate(base | overrides)


def code_of(call: AiCallRecord) -> str | None:
    """`ai_call_log.error_code` as a plain string. It is a root model on the generated contract."""
    return None if call.error_code is None else call.error_code.root


def flags_of(response: EvaluateAnswerResponse) -> list[str]:
    """`evidence_flags` as plain strings; they are root models on the generated contract."""
    return [flag.root for flag in response.evidence_flags]


def service(steps: list[Step]) -> tuple[EvaluationService, ScriptedLLMClient]:
    """An evaluation service backed by a scripted model."""
    llm = ScriptedLLMClient(steps)
    return EvaluationService(Evaluator(llm, "fake"), NullTracer()), llm

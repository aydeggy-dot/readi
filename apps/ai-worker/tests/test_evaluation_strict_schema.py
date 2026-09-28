"""The per-rubric output schema: a criterion cannot be left out, and none can be invented.

Written after wording failed twice. `rejected_criteria` was the only recorded cause of a thrown-away
opus reading, and `evaluate_answer` v3 — which stated the rule, said what breaking it costs, and
printed the expected numbers — measured no fall at all. So this is the structural attempt, and what
these tests are for is that the constraint **reaches the provider**: a schema that looks strict on
our side and arrives unconstrained is worse than none, because it would be believed.

It is off by default and has never been sent to a real provider. Nothing here claims it works; what
it claims is that the shape is right, that omission and invention are impossible against it, and
that the whole pipeline runs on the stand-in with it on.
"""

import anthropic
import pytest
from pydantic import SecretStr, ValidationError, create_model

from readi_worker.cv.parse import keyword_extraction
from readi_worker.evaluation.calls import AnswerReading, CriterionReading, Evaluator
from readi_worker.evaluation.fake_script import FakeEvaluatorLLMClient
from readi_worker.evaluation.service import EvaluationService
from readi_worker.evaluation.strict_schema import (
    CriterionBody,
    as_answer_reading,
    strict_reading_model,
)
from readi_worker.llm.fake import FunctionLLMClient
from readi_worker.settings import Settings
from readi_worker.tracing import NullTracer
from tests.evaluation_fixtures import request

READING = {
    "covered_points": [],
    "missing_points": [],
    "strengths": [],
    "improvement_tip": "Say what you measured.",
    "red_flags": [],
    "confidence": "low",
}


def body(score: int) -> dict[str, object]:
    return {"reasoning": "Because of what they said.", "evidence": [], "score": score}


# ---- What reaches the provider.


def test_the_constraint_survives_the_sdks_schema_transform() -> None:
    """The only thing that matters: `required` and `additionalProperties` arrive intact."""
    schema = anthropic.transform_schema(strict_reading_model((0, 1, 2)))
    criteria = schema["$defs"]["StrictCriteria"]
    assert criteria["required"] == ["0", "1", "2"]
    assert criteria["additionalProperties"] is False
    assert sorted(criteria["properties"]) == ["0", "1", "2"]


def test_the_obvious_tuple_shape_would_have_arrived_unconstrained() -> None:
    """Why this is an object and not a fixed-length list, pinned so nobody "improves" it back.

    `prefixItems` with a `const` per entry is the natural JSON Schema for "entry *n* is criterion
    *n*". `transform_schema` folds `prefixItems`, `minItems` and `maxItems` into the schema's
    **description string** — so the provider would receive a plain unconstrained array with a
    sentence about tuples in its docs, and it would have looked exactly like a working guarantee.
    """
    entry = create_model("Entry", __base__=CriterionBody)
    tupled = create_model("Tupled", criteria=(tuple[entry, entry], ...))
    criteria = anthropic.transform_schema(tupled)["properties"]["criteria"]
    assert criteria["type"] == "array"
    assert "prefixItems" not in criteria
    assert "minItems" not in criteria
    # It is not lost silently in the sense of vanishing — it is lost into prose, which is worse.
    assert "prefixItems" in criteria.get("description", "")


# ---- What it accepts and refuses.


def test_the_exact_set_is_accepted_and_comes_back_in_position_order() -> None:
    model = strict_reading_model((0, 1, 2))
    strict = model.model_validate(
        {**READING, "criteria": {"2": body(1), "0": body(3), "1": body(2)}}
    )
    answer = as_answer_reading(strict)
    assert isinstance(answer, AnswerReading)
    assert [(entry.criterion, entry.score) for entry in answer.criteria] == [(0, 3), (1, 2), (2, 1)]


def test_a_criterion_cannot_be_left_out() -> None:
    """The failure v3 was written against, and could not prevent by asking."""
    with pytest.raises(ValidationError) as caught:
        strict_reading_model((0, 1, 2)).model_validate(
            {**READING, "criteria": {"0": body(3), "1": body(2)}}
        )
    assert "criteria.2" in str(caught.value)


def test_a_criterion_cannot_be_invented() -> None:
    with pytest.raises(ValidationError) as caught:
        strict_reading_model((0, 1)).model_validate(
            {**READING, "criteria": {"0": body(3), "1": body(2), "7": body(4)}}
        )
    assert "criteria.7" in str(caught.value)


def test_a_rubric_whose_positions_are_not_contiguous_is_held_to_its_own() -> None:
    model = strict_reading_model((0, 3))
    assert (
        as_answer_reading(
            model.model_validate({**READING, "criteria": {"0": body(1), "3": body(4)}})
        )
        .criteria[1]
        .criterion
        == 3
    )
    with pytest.raises(ValidationError):
        model.model_validate({**READING, "criteria": {"0": body(1), "1": body(4)}})


def test_the_score_ladder_is_still_the_ladder() -> None:
    with pytest.raises(ValidationError):
        strict_reading_model((0,)).model_validate({**READING, "criteria": {"0": body(5)}})


def test_no_positions_means_the_ordinary_model() -> None:
    assert strict_reading_model(()) is AnswerReading


def test_the_body_is_the_criterion_reading_minus_its_position() -> None:
    """Two declarations of one shape is how a constraint goes missing from one of them."""
    assert set(CriterionBody.model_fields) == set(CriterionReading.model_fields) - {"criterion"}
    for name, field in CriterionBody.model_fields.items():
        assert str(field.annotation) == str(CriterionReading.model_fields[name].annotation)
    # And the score keeps its bounds, which is the constraint that would be missed.
    assert [str(item) for item in CriterionBody.model_fields["score"].metadata] == [
        str(item) for item in CriterionReading.model_fields["score"].metadata
    ]
    # Evidence before the number, as `CriterionReading`'s own ordering argument says.
    assert list(CriterionBody.model_fields) == ["reasoning", "evidence", "score"]


# ---- On the stand-in, end to end.


async def test_the_whole_pipeline_runs_on_the_stand_in_with_it_on() -> None:
    """The proof available without spending: the real stand-in, the real service, the strict schema.

    `FakeEvaluatorLLMClient` is what `--smoke` runs and what a developer without a key runs, and it
    has to answer in the strict shape here — so `model_validate` is doing real work: a reading with
    the wrong set of criteria would raise rather than quietly arrive short.

    The scripted client is deliberately **not** used. It belongs to the LLM layer and knows nothing
    about rubrics; teaching it this shape would point `llm/` at `evaluation/`.
    """
    evaluator = EvaluationService(
        Evaluator(
            FakeEvaluatorLLMClient(FunctionLLMClient(keyword_extraction)),
            "fake",
            strict_criteria=True,
        ),
        NullTracer(),
    )
    response = await evaluator.evaluate(request())
    assert response.error is None
    assert response.evaluation is not None
    assert [entry.criterion for entry in response.evaluation.criteria] == [0, 1]


def test_it_is_what_production_scores_with() -> None:
    """On since 2026-09-28, measured over 60 answers and all twelve rubrics of the comparison.

    Off is now the diagnostic: it goes back to an evaluator that threw away a quarter of its
    readings. The default may not change back quietly any more than it could change forward quietly.
    """
    assert Settings(service_token=SecretStr("x" * 32)).evaluator_strict_criteria_schema is True


def test_the_evaluators_own_default_stays_off_and_that_is_deliberate() -> None:
    """`main.py` passes the setting, so this default reaches no candidate — it reaches the tests.

    `service.py`'s suite constructs an `Evaluator` without the flag, and the three gates it covers
    include the `rejected_criteria` check the schema is meant to make unreachable. That check is
    still live code and still the last line if a provider ignores the schema, so it needs a shape it
    can fire on.
    """
    assert Evaluator(_NoLLM(), "fake")._strict_criteria is False  # type: ignore[arg-type]


class _NoLLM:
    """An `LLMClient` that would fail loudly if the default ever started making calls."""

    provider = "fake"

    async def parse(self, **_: object) -> object:  # pragma: no cover — never called
        raise AssertionError("not called")

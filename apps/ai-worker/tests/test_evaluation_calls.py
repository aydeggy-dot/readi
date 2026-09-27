"""The one model call: what it records, and the constants it must not drift from."""

from readi_worker.contracts import CriterionScore
from readi_worker.evaluation.calls import (
    MAX_ATTEMPTS,
    MAX_CRITERION_SCORE,
    PURPOSE,
    Evaluator,
    rejected,
)
from readi_worker.llm.fake import FakeLLMError, ScriptedLLMClient
from tests.evaluation_fixtures import code_of, reading


def test_the_ladder_matches_the_contract_it_is_scored_against() -> None:
    """`MAX_CRITERION_SCORE` here and in @readi/shared-types are the same number or this is broken.

    The generated `CriterionScore` carries the bound from Zod, so this reads the contract rather
    than trusting a comment. A rubric grown a sixth rung fails here, which is where it should.
    """
    bounds = [
        getattr(item, "le", None)
        for item in CriterionScore.model_fields["score"].metadata
        if getattr(item, "le", None) is not None
    ]
    assert bounds == [MAX_CRITERION_SCORE]


def test_one_call_and_two_retries_at_most() -> None:
    assert MAX_ATTEMPTS == 3


async def test_a_successful_call_is_recorded_as_a_cost_row() -> None:
    llm = ScriptedLLMClient([reading()])
    result = await Evaluator(llm, "fake").read(system="s", user="u")

    assert result.output is not None
    assert result.failure is None
    assert result.record.purpose == PURPOSE
    assert result.record.status == "ok"
    assert result.record.unit_kind == "tokens"
    assert result.record.input_units == 1000
    assert result.record.error_code is None


async def test_a_provider_failure_is_a_record_rather_than_an_exception() -> None:
    llm = ScriptedLLMClient([FakeLLMError("RateLimitError")])
    result = await Evaluator(llm, "fake").read(system="s", user="u")

    assert result.output is None
    assert result.failure == "RateLimitError"
    assert result.record.status == "error"
    assert code_of(result.record) == "RateLimitError"
    assert result.record.cost_micro_usd == 0


async def test_output_the_code_threw_away_stays_an_ok_call_with_a_reason() -> None:
    """The provider did its job and charged for it; what failed was our check on the answer."""
    llm = ScriptedLLMClient([reading()])
    result = await Evaluator(llm, "fake").read(system="s", user="u")
    marked = rejected(result.record, "rejected_evidence")

    assert marked.status == "ok"
    assert code_of(marked) == "rejected_evidence"
    assert marked.cost_micro_usd == result.record.cost_micro_usd


async def test_a_rejected_record_serialises_without_a_pydantic_warning() -> None:
    """`error_code` is a root model on the generated contract, and `model_copy(update=...)`
    skips validation — leaving a bare `str` in the field, which happens to serialise correctly.
    Pydantic warns; this makes the warning a failure, because "happens to work" stops working."""
    import warnings

    llm = ScriptedLLMClient([reading()])
    result = await Evaluator(llm, "fake").read(system="s", user="u")
    marked = rejected(result.record, "rejected_evidence")
    with warnings.catch_warnings():
        warnings.simplefilter("error", UserWarning)
        assert marked.model_dump(mode="json")["error_code"] == "rejected_evidence"


async def test_the_model_name_travels_with_the_record() -> None:
    llm = ScriptedLLMClient([reading()])
    evaluator = Evaluator(llm, "claude-opus-5")
    result = await evaluator.read(system="s", user="u")
    assert result.record.model == "claude-opus-5"
    assert evaluator.model == "claude-opus-5"
    assert evaluator.provider == "fake"

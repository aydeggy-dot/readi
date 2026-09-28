"""The one model call: what it records, and the constants it must not drift from."""

from pydantic import BaseModel

from readi_worker.contracts import CriterionScore
from readi_worker.evaluation.calls import (
    CACHE_SYSTEM_PROMPT,
    MAX_ATTEMPTS,
    MAX_CRITERION_SCORE,
    PURPOSE,
    AnswerReading,
    Evaluator,
    rejected,
)
from readi_worker.llm.base import LLMResult
from readi_worker.llm.fake import FakeLLMError, ScriptedLLMClient
from tests.evaluation_fixtures import code_of, reading


class CachingLLMClient:
    """A provider that served most of the prompt from cache, and says so as the SDK does."""

    provider = "anthropic"

    def __init__(self, output: AnswerReading) -> None:
        self._output = output

    async def parse[T: BaseModel](
        self,
        *,
        model: str,
        system: str,
        user: str,
        output_type: type[T],
        max_tokens: int,
        timeout_s: float | None = None,
        cache_system: bool = False,
    ) -> LLMResult[T]:
        return LLMResult(
            output=output_type.model_validate(self._output.model_dump()),
            provider=self.provider,
            model=model,
            input_tokens=2_600,
            output_tokens=1_000,
            latency_ms=15_000,
            cache_write_tokens=0,
            cache_read_tokens=1_700,
        )


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


# ---- Prompt caching (2026-09-28).


async def test_the_evaluator_asks_for_its_system_prompt_to_be_cached() -> None:
    """The one call in the worker that does. It is the same ~1,700-token system prompt on every
    answer of every session of every candidate, so the entry is global and every later call reads
    it."""
    llm = ScriptedLLMClient([reading()])
    await Evaluator(llm, "fake").read(system="s", user="u")
    assert llm.cache_system == [CACHE_SYSTEM_PROMPT] == [True]


async def test_the_record_keeps_the_three_input_figures_apart() -> None:
    """Folded together, `cost_micro_usd` stops being derivable from the row and the measurement the
    model comparison rests on becomes a number somebody has to take on trust."""
    llm = CachingLLMClient(reading())
    result = await Evaluator(llm, "claude-opus-5").read(system="s", user="u")

    record = result.record
    units = (record.input_units, record.cache_write_units, record.cache_read_units)
    assert units == (2_600, 0, 1_700)
    # 2,600 x $5 + 1,000 x $25 + 1,700 x $5 x 0.1
    assert record.cost_micro_usd == 2_600 * 5 + 1_000 * 25 + 850


async def test_an_unreachable_provider_reports_no_cache_units() -> None:
    llm = ScriptedLLMClient([FakeLLMError()])
    result = await Evaluator(llm, "fake").read(system="s", user="u")
    assert (result.record.cache_write_units, result.record.cache_read_units) == (0, 0)

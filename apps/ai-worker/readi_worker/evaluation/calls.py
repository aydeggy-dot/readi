"""The one model call that receives a rubric, and what it costs.

Deliberately thin: it renders nothing, decides nothing and retries nothing. Whether an answer's
reading is usable depends on the rubric it was read against and on the transcript it quotes, and
both of those live in `service.py` — so the loop lives there too, and this is one call, one record.

The output model's fields are in the order the model fills them: the criterion, then the reason,
then the quotes, and the **score last**. A schema filled in order makes a model state its evidence
before it commits to a number, which is the cheapest reasoning there is and the same trick
`ProbeVerdict` uses in the interview engine.
"""

import logging
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from readi_worker.contracts import AiCallRecord
from readi_worker.llm.base import LLMClient, LLMError, LLMResult
from readi_worker.llm.pricing import token_cost_micro_usd
from readi_worker.tracing import call_label, current_trace_id

logger = logging.getLogger(__name__)

#: The rubric's ladder has five rungs, "0" to "4". `test_evaluation_calls.py` ties this to the
#: generated `CriterionScore`, so it cannot drift from `MAX_CRITERION_SCORE` in @readi/shared-types.
MAX_CRITERION_SCORE = 4

#: One call plus up to two retries on invalid output, never on a refusal (CLAUDE.md "Evaluation").
MAX_ATTEMPTS = 3

#: A full reading of one answer: five criteria with quotes and reasons, plus the lists. Generous,
#: because the failure mode of a tight cap is a truncated final criterion — invalid output that
#: costs a whole retry to discover.
MAX_OUTPUT_TOKENS = 4_000

#: **There is no temperature to set.** CLAUDE.md §5 asks for evaluation "with low temperature", and
#: current Claude models reject sampling parameters outright (`anthropic_client.py`). What actually
#: keeps a score from wandering between two runs of the same answer is the other half of that
#: sentence — schema-constrained structured output — plus `effort: low` for this model, and the
#: criteria arriving as a fixed ladder rather than a free scale. Whether that is stable enough is
#: measurable rather than arguable: the `/evals` harness scores the same fixed answers repeatedly,
#: and a score that moves is a finding there.

#: Nobody is watching a spinner for this — it runs in a queue after the session has ended. But the
#: report is promised within 60 s of the session ending (spec §8), and the API fans out several
#: answers at once, so a single call that takes longer than this has already lost that race and is
#: better retried than waited on.
DEFAULT_TIMEOUT_S = 60.0

PURPOSE: Literal["evaluator"] = "evaluator"

#: The system prompt is cached, and it is the only part of the request that can be (2026-09-28).
#:
#: Render order is `tools → system → messages`, and this call's user message diverges at its first
#: interpolation — the question — two lines in. So the shared prefix is `evaluate_answer.vN.md` and
#: nothing else: ~1,700 tokens of a ~4,350-token call, the same for every answer of every session
#: and every candidate, which is what makes the entry worth writing at all.
#:
#: **Pre-warming it is not available to us.** `max_tokens: 0` — the documented way to write a cache
#: entry before the traffic arrives — is an `invalid_request_error` together with
#: `output_config.format`, and every evaluator call is structured output. That is why the API
#: scores the first answer of a session alone and fans the rest out behind it: somebody has to pay
#: the write before the others can read it, and it cannot be a request that generates nothing.
CACHE_SYSTEM_PROMPT = True


class CriterionReading(BaseModel):
    """One criterion, as the model reads it. Not yet checked against anything."""

    model_config = ConfigDict(extra="ignore")
    criterion: int = Field(ge=0)
    reasoning: str
    evidence: list[str]
    score: int = Field(ge=0, le=MAX_CRITERION_SCORE)


class AnswerReading(BaseModel):
    """The model's whole reading of one answer, before code has had an opinion about it."""

    model_config = ConfigDict(extra="ignore")
    criteria: list[CriterionReading]
    covered_points: list[str]
    missing_points: list[str]
    strengths: list[str]
    improvement_tip: str
    red_flags: list[str]
    confidence: Literal["low", "medium", "high"]


@dataclass(frozen=True, slots=True)
class Reading:
    """One attempt: what the model produced, and the record of what it cost."""

    output: AnswerReading | None
    record: AiCallRecord
    #: "refusal", "max_tokens", "invalid_output", or a provider code. None when `output` is set.
    failure: str | None


class Evaluator:
    """One model call, made and paid for."""

    def __init__(self, llm: LLMClient, model: str, timeout_s: float = DEFAULT_TIMEOUT_S) -> None:
        self._llm = llm
        self._model = model
        self._timeout_s = timeout_s

    @property
    def provider(self) -> str:
        return self._llm.provider

    @property
    def model(self) -> str:
        return self._model

    async def read(self, *, system: str, user: str) -> Reading:
        """Ask for one reading. Never raises: a provider failure is a `Reading` with no output."""
        try:
            # Also the name of the generation in Langfuse, so an evaluator call is findable beside
            # the interview turns of the same session (ADR-0008).
            with call_label(PURPOSE):
                result = await self._llm.parse(
                    model=self._model,
                    system=system,
                    user=user,
                    output_type=AnswerReading,
                    max_tokens=MAX_OUTPUT_TOKENS,
                    timeout_s=self._timeout_s,
                    cache_system=CACHE_SYSTEM_PROMPT,
                )
        except LLMError as exc:
            return Reading(output=None, record=_error_record(exc), failure=exc.code)
        return Reading(output=result.output, record=_record(result), failure=result.failure)


def _record(result: LLMResult[AnswerReading], *, rejected_code: str | None = None) -> AiCallRecord:
    """One call, for `ai_call_log` (ADR-0007).

    `rejected_code` is for output the model produced and code then threw away — invalid against the
    rubric, or quoting words nobody said. The call succeeded and cost money, so `status` stays `ok`:
    what failed was our check on it, and a reader looking at provider health needs to tell those
    apart. The same distinction `REJECTED_ADDED_ASK` draws in the interview engine.
    """
    return AiCallRecord.model_validate(
        {
            "purpose": PURPOSE,
            "provider": result.provider,
            "model": result.model,
            "status": "ok" if result.output is not None else "error",
            "error_code": rejected_code or result.failure,
            "latency_ms": result.latency_ms,
            # The uncached remainder, the write and the read, kept apart because they are billed
            # at three different rates and a cost that cannot be re-derived from its own row is not
            # a measurement.
            "input_units": result.input_tokens,
            "output_units": result.output_tokens,
            "cache_write_units": result.cache_write_tokens,
            "cache_read_units": result.cache_read_tokens,
            "unit_kind": "tokens",
            "cost_micro_usd": token_cost_micro_usd(
                result.provider,
                result.model,
                result.input_tokens,
                result.output_tokens,
                result.cache_write_tokens,
                result.cache_read_tokens,
            ),
            "langfuse_trace_id": current_trace_id(),
        }
    )


def _error_record(exc: LLMError) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": PURPOSE,
            "provider": exc.provider,
            "model": exc.model,
            "status": "error",
            "error_code": exc.code[:60],
            "latency_ms": exc.latency_ms,
            "input_units": 0,
            "output_units": 0,
            "cache_write_units": 0,
            "cache_read_units": 0,
            "unit_kind": "tokens",
            "cost_micro_usd": 0,
            "langfuse_trace_id": current_trace_id(),
        }
    )


def rejected(record: AiCallRecord, code: str) -> AiCallRecord:
    """The same record, marked as output code threw away. `status` stays as it was.

    Rebuilt through validation rather than `model_copy(update=...)`, which skips it: `error_code` is
    a constrained nullable string, so the generated model holds an `ErrorCode` root model and an
    update would leave a bare `str` in the field. It serialises to the right characters by luck and
    Pydantic warns about it — `test_evaluation_calls.py` turns that warning into a failure.
    """
    return AiCallRecord.model_validate(record.model_dump() | {"error_code": code})

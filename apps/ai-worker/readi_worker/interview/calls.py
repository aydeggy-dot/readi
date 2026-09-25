"""The two model calls the engine makes, and what it does when they fail.

There are exactly two shapes, and the difference between them is the whole design:

- **phrasing** — the engine has decided what to say and the model says it in the conversation's
  voice. Structured output, so a turn is a string and never a monologue with headings in it.
- **coverage** — the model judges whether an answer has already reached each probe still in play.
  It decides nothing: code reads the verdicts and picks.

Neither receives a rubric, criteria, weights, level descriptors or ideal points. The bundle does not
carry them (`session-bundle.ts`), so the answer key is absent from every call made here — which is a
privacy improvement, a smaller prompt-injection surface and a cheaper prompt all at once.

**A model that will not answer does not stop the interview.** Every call has a fallback in pinned,
staff-written content: a question falls back to its own prompt, a follow-up to its own probe, the
close to a fixed line. The candidate gets a plainer interview rather than a broken one, and the
failure is in `ai_calls` for anyone reading afterwards. The single exception is answering a question
the candidate asked, where there is nothing honest to fall back to.
"""

import logging
import re
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, ConfigDict

from readi_worker.contracts import AiCallRecord
from readi_worker.llm.base import LLMClient, LLMError, LLMResult
from readi_worker.llm.pricing import token_cost_micro_usd

logger = logging.getLogger(__name__)

PROMPT_VERSION = 1

#: One call plus up to two retries on invalid output, never on refusal (CLAUDE.md "Evaluation").
MAX_ATTEMPTS = 3

#: An interviewer asks and then listens. A turn longer than this is the model lecturing.
#: Mirrors `INTERVIEW_LIMITS.speechMaxLength` in @readi/shared-types.
SPEECH_MAX_LENGTH = 1_200

MAX_SPEECH_TOKENS = 800
MAX_COVERAGE_TOKENS = 1_500

#: A candidate is watching a spinner while this runs, so it is far shorter than `LLM_TIMEOUT_S`
#: (which is right for a CV parsed in a background job). Two of these chained is the worst case an
#: exchange puts in front of them, and `AI_WORKER_TIMEOUT_MS` is sized from it.
DEFAULT_TIMEOUT_S = 45.0

Purpose = Literal["interviewer", "coverage", "follow_up"]


class Speech(BaseModel):
    """One thing the interviewer says."""

    model_config = ConfigDict(extra="ignore")
    speech: str


class ProbeVerdict(BaseModel):
    """Whether one follow-up would be redundant.

    `reason` is asked for **before** `already_answered` on purpose: a schema the model fills in
    order makes it state the evidence before the verdict, which is the cheapest reasoning there is.
    It is never stored and never logged — it is a model's sentence about what a candidate said, so
    it is transcript-shaped and CLAUDE.md's "never log transcripts" covers it.
    """

    model_config = ConfigDict(extra="ignore")
    probe: int
    reason: str
    already_answered: bool


class CoverageJudgement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    probes: list[ProbeVerdict]


@dataclass(frozen=True, slots=True)
class Spoken:
    """What the interviewer says, and whether the model or the fallback said it."""

    text: str
    from_fallback: bool


class Interviewer:
    """Every model call the engine makes, with its retries, its records and its fallbacks."""

    def __init__(self, llm: LLMClient, model: str, timeout_s: float = DEFAULT_TIMEOUT_S) -> None:
        self._llm = llm
        self._model = model
        self._timeout_s = timeout_s

    @property
    def model_config_record(self) -> dict[str, str]:
        """What `interview_sessions.model_config` records for this session."""
        return {"provider": self._llm.provider, "interviewer": self._model}

    async def speak(
        self, *, purpose: Purpose, system: str, user: str, fallback: str | None
    ) -> tuple[Spoken | None, list[AiCallRecord]]:
        """Phrase one turn. None only when there is no fallback and the model gave nothing."""
        calls: list[AiCallRecord] = []
        for _attempt in range(MAX_ATTEMPTS):
            try:
                result = await self._llm.parse(
                    model=self._model,
                    system=system,
                    user=user,
                    output_type=Speech,
                    max_tokens=MAX_SPEECH_TOKENS,
                    timeout_s=self._timeout_s,
                )
            except LLMError as exc:
                calls.append(_error_record(purpose, exc))
                break
            calls.append(_record(purpose, result))
            if result.output is not None:
                spoken = normalise_speech(result.output.speech)
                if spoken:
                    return Spoken(spoken, from_fallback=False), calls
                # Valid JSON, empty utterance: retryable in the same way invalid output is.
            if result.failure == "refusal":
                break  # never retry a refusal (CLAUDE.md "AI provider adapters")
        if fallback is None:
            return None, calls
        logger.info("interview %s call fell back to the pinned wording", purpose)
        return Spoken(normalise_speech(fallback) or fallback, from_fallback=True), calls

    async def judge_coverage(
        self, *, system: str, user: str, probes: tuple[int, ...]
    ) -> tuple[list[ProbeVerdict] | None, list[AiCallRecord]]:
        """Judge which probes the answer already reached. None means nothing was judged.

        None is not a failure to be hidden: the coverage log records `not_judged` for every
        criterion, the engine asks the probe it would have asked anyway, and the interview continues
        on the safe side — a follow-up that was not needed costs a minute, one that was never asked
        loses something the candidate would have said.
        """
        calls: list[AiCallRecord] = []
        for _attempt in range(MAX_ATTEMPTS):
            try:
                result = await self._llm.parse(
                    model=self._model,
                    system=system,
                    user=user,
                    output_type=CoverageJudgement,
                    max_tokens=MAX_COVERAGE_TOKENS,
                    timeout_s=self._timeout_s,
                )
            except LLMError as exc:
                calls.append(_error_record("coverage", exc))
                return None, calls
            calls.append(_record("coverage", result))
            if result.output is not None:
                verdicts = normalise_verdicts(result.output, probes)
                if verdicts:
                    return verdicts, calls
                # An answer that names none of the probes we asked about is not an answer to the
                # question we asked, whatever its shape: retry it like invalid output.
            if result.failure == "refusal":
                break
        return None, calls


# ---- Normalisation: the model speaks, code decides what a turn may contain.

_TAG = re.compile(r"</?[a-z_]{2,40}>", re.IGNORECASE)
_MARKUP = re.compile(r"^\s*(?:[-*•>]+\s+|#{1,6}\s+)", re.MULTILINE)
_SPACE = re.compile(r"\s+")
_SENTENCE_END = re.compile(r"[.!?…](?:[\"')\]]+)?(?:\s|$)")


def normalise_speech(text: str, limit: int = SPEECH_MAX_LENGTH) -> str:
    """One spoken turn: no markup, no leaked tags, one paragraph, bounded length.

    The bound is cut at a sentence boundary rather than mid-word, because the candidate reads this
    and an interviewer who trails off mid-sentence reads as a bug, which it is.
    """
    cleaned = _SPACE.sub(" ", _MARKUP.sub("", _TAG.sub("", text))).strip()
    cleaned = cleaned.strip("\"'").strip()
    if len(cleaned) <= limit:
        return cleaned
    ends = [match.end() for match in _SENTENCE_END.finditer(cleaned) if match.end() <= limit]
    if ends:
        return cleaned[: ends[-1]].strip()
    cut = cleaned.rfind(" ", 0, limit)
    return cleaned[: cut if cut > 0 else limit].rstrip() + "…"


def normalise_verdicts(judgement: CoverageJudgement, probes: tuple[int, ...]) -> list[ProbeVerdict]:
    """Keep one verdict per probe we asked about, in the order we asked.

    A probe the model did not mention is not an omission to retry over — it is simply not covered,
    which is the safe side. A probe it invented is dropped: the engine picks from the question's own
    list and an index that is not in it cannot mean anything.
    """
    seen: dict[int, ProbeVerdict] = {}
    for verdict in judgement.probes:
        if verdict.probe in probes and verdict.probe not in seen:
            seen[verdict.probe] = verdict
    return [seen[index] for index in probes if index in seen]


def _record(purpose: Purpose, result: LLMResult[BaseModel]) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": purpose,
            "provider": result.provider,
            "model": result.model,
            "status": "ok" if result.output is not None else "error",
            "error_code": result.failure,
            "latency_ms": result.latency_ms,
            "input_units": result.input_tokens,
            "output_units": result.output_tokens,
            "unit_kind": "tokens",
            "cost_micro_usd": token_cost_micro_usd(
                result.provider, result.model, result.input_tokens, result.output_tokens
            ),
        }
    )


def _error_record(purpose: Purpose, exc: LLMError) -> AiCallRecord:
    return AiCallRecord.model_validate(
        {
            "purpose": purpose,
            "provider": exc.provider,
            "model": exc.model,
            "status": "error",
            "error_code": exc.code[:60],
            "latency_ms": exc.latency_ms,
            "input_units": 0,
            "output_units": 0,
            "unit_kind": "tokens",
            "cost_micro_usd": 0,
        }
    )

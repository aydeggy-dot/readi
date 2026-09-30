"""Where one voice turn's time went (ADR-0019 §5, `VoiceTurnLatency`).

**Every figure is an offset from the moment the candidate stopped speaking**, not a duration of its
own stage, so the numbers in one sample can be read against each other and against the two targets:
first audio under 250 ms at p50, and the question or probe within 1.5-2.5 s (`VOICE_LIMITS`). A
table of durations would need the reader to add them up in the right order, and phase 8's report is
read by people deciding whether to pay for levers 3 and 4.

`interim_coverage` is here and always false: lever 3 is a phase 8 decision with a measurement in
front of it (ADR-0019 §5). The field exists because the report has to be able to say which samples
were taken with it on, and a column added later would not cover the runs that decided it.

## The model-call stages are reconstructed, and this says how

`coverage_ms` and `phrasing_ms` are not timed by the transport: they happen inside
`InterviewService.advance()`, which voice shares with text mode and which does not know it is being
timed. Rather than thread a stopwatch through the engine, they are reconstructed from the
`AiCallRecord`s the exchange produced — the rows the bill is derived from, with latency measured
inside the adapter — laid end to end from the offset at which the engine was entered. The
reconstruction ignores prompt rendering and bookkeeping between the calls, which are microseconds
against a call of a second, and it counts a retry, because a retried call really did take that long.

The one case it must not count is a **prefetched** phrasing (lever 2): that call was made while the
candidate was still answering the *previous* question, and its record rides home with the exchange
that used it. So a prefetched turn reports `phrasing_ms: null`, which is what the contract already
says it means.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime

from readi_worker.contracts import AiCallRecord, VoiceTurnLatency

#: Which `AiCallRecord.purpose` belongs to which stage of a voice turn.
COVERAGE_PURPOSES = ("coverage",)
PHRASING_PURPOSES = ("interviewer", "follow_up")


@dataclass(slots=True)
class TurnTiming:
    """One turn's stopwatch, filled in as the turn happens.

    Built by the transport the moment the candidate's speech ends and handed to the driver, so the
    stages that only the transport can see (endpointing, the recogniser's final, the first audio
    byte) are measured where they happen, and the rest are added as the exchange runs.
    """

    #: Wall clock, for the record; every other figure is milliseconds after it.
    speech_ended_at: datetime
    #: The monotonic reading at that same moment — what the offsets are actually measured from.
    #: Wall clock is for the row a person reads; a stopwatch that can be set backwards is not a
    #: stopwatch.
    started_at: float = 0.0
    #: Voice activity ending → the turn detector committing.
    endpoint_ms: int = 0
    #: → the recogniser's final transcript.
    stt_final_ms: int = 0
    #: → the first audio byte of the pinned acknowledgement. None when none was played.
    acknowledged_ms: int | None = None
    #: → entering the engine. Not reported on its own; it is where the model calls are laid from.
    engine_entered_ms: int = 0
    interim_coverage: bool = False
    #: The `AiCallRecord`s the exchange produced, for the reconstruction above.
    ai_calls: list[AiCallRecord] = field(default_factory=list)

    def samples(self, spoken: Sequence["SpokenTiming"]) -> list[VoiceTurnLatency]:
        """One `VoiceTurnLatency` per interviewer turn this answer produced.

        Usually one. The exception is the exchange that opens the interview — greeting and first
        question — and that one has no candidate speech in front of it, so it produces no samples
        at all. Where there are two, only the **first** carries `acknowledged_ms`: the
        acknowledgement was played once, before either of them, and repeating it on the second
        would double it in every p50 taken over the column.
        """
        coverage_ms, phrasing_ms = stage_offsets(
            self.ai_calls, self.engine_entered_ms, prefetched=any(one.prefetched for one in spoken)
        )
        return [
            VoiceTurnLatency.model_validate(
                {
                    "turn_seq": one.turn_seq,
                    "speech_ended_at": self.speech_ended_at.isoformat(),
                    "endpoint_ms": _ms(self.endpoint_ms),
                    "stt_final_ms": _ms(self.stt_final_ms),
                    "acknowledged_ms": _optional_ms(self.acknowledged_ms) if index == 0 else None,
                    "coverage_ms": _optional_ms(coverage_ms),
                    "phrasing_ms": _optional_ms(phrasing_ms),
                    "tts_first_byte_ms": _optional_ms(one.tts_first_byte_ms),
                    "response_ms": _ms(one.response_ms),
                    "prefetched": one.prefetched,
                    "interim_coverage": self.interim_coverage,
                    "interrupted": one.interrupted,
                }
            )
            for index, one in enumerate(spoken)
        ]


@dataclass(frozen=True, slots=True)
class SpokenTiming:
    """What is true of one spoken turn rather than of the answer that led to it."""

    turn_seq: int
    #: End of speech → the first audio byte of this turn.
    response_ms: int
    #: → the first byte back from the synthesizer. None when the audio was already rendered,
    #: which is what a pinned line and a prefetched opening both are.
    tts_first_byte_ms: int | None = None
    prefetched: bool = False
    interrupted: bool = False


def stage_offsets(
    ai_calls: Iterable[AiCallRecord], engine_entered_ms: int, *, prefetched: bool
) -> tuple[int | None, int | None]:
    """When the coverage call and the phrasing call finished, as offsets from end of speech.

    None for a call that was not made, which is information rather than a gap: no `coverage_ms`
    means `machine.probes_to_judge` said there was nothing a verdict could change, and no
    `phrasing_ms` means the opening was prefetched or the pinned wording was spoken.
    """
    calls = list(ai_calls)
    coverage_total = _total(calls, COVERAGE_PURPOSES)
    phrasing_total = None if prefetched else _total(calls, PHRASING_PURPOSES)
    coverage_ms = None if coverage_total is None else engine_entered_ms + coverage_total
    if phrasing_total is None:
        return coverage_ms, None
    return coverage_ms, (coverage_ms if coverage_ms is not None else engine_entered_ms) + (
        phrasing_total
    )


def _total(calls: Sequence[AiCallRecord], purposes: tuple[str, ...]) -> int | None:
    """How long the calls of these purposes took in all, or None if none were made.

    A retry counts: two attempts at one phrasing really did cost the candidate both.
    """
    latencies = [call.latency_ms for call in calls if call.purpose in purposes]
    return sum(latencies) if latencies else None


def _ms(value: int) -> int:
    return max(0, int(value))


def _optional_ms(value: int | None) -> int | None:
    return None if value is None else _ms(value)

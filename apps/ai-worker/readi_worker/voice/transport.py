"""What the leg asks of the world: a clock, something that speaks, and somewhere to push turns.

These four Protocols are why `session.py` needs no LiveKit to test. The real implementations live in
`agent.py` (a room) and `api_client.py` (the API); the tests use small doubles that record what was
said and answer with scripted playback, which is what makes the barge-in rule and the whole latency
ladder testable without a server, a microphone or a key.

The shape is deliberately narrow. A transport can speak a line, optionally with audio somebody else
rendered, and it can say afterwards how much of it was heard. It is not asked to know anything about
interviews.
"""

import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from readi_worker.contracts import (
    AiCallRecord,
    InterviewTurnPush,
    InterviewTurnPushResponse,
    VoiceLegEndedRequest,
    VoiceLegEndedResponse,
    VoiceSessionStartResponse,
)
from readi_worker.voice.barge_in import Playback


@dataclass(frozen=True, slots=True)
class Clip:
    """Audio somebody has already rendered — a pinned line, or a prefetched opening."""

    audio: bytes
    content_type: str
    #: How long it plays, where the renderer knew. `barge_in.heard_the_ask` needs it to place an
    #: interruption in the text, and without it an interrupted turn counts as unheard.
    seconds: float | None = None


class Utterance(Protocol):
    """One thing the interviewer is saying, from the caller's side."""

    async def started(self) -> bool:
        """Resolve when the first audio byte is out. False if it never began (cancelled)."""
        ...

    async def settled(self) -> Playback:
        """Resolve when the audio has finished or been cut off, with how far it got."""
        ...

    @property
    def synthesis_ttfb_ms(self) -> int | None:
        """The synthesizer's first byte, where the transport can see it; None for pinned audio."""
        ...


class Speaker(Protocol):
    """The interviewer's mouth."""

    def say(self, text: str, *, clip: Clip | None = None, interruptible: bool = True) -> Utterance:
        """Say `text`, playing `clip` instead of synthesizing it when one is given."""
        ...


class TurnPusher(Protocol):
    """Where a completed exchange goes (ADR-0019 §3)."""

    async def push(self, session_id: str, push: InterviewTurnPush) -> InterviewTurnPushResponse: ...


class LegReporter(Protocol):
    """What meters the leg when it is over."""

    async def leg_ended(
        self, session_id: str, request: VoiceLegEndedRequest
    ) -> VoiceLegEndedResponse: ...


class SessionSource(Protocol):
    """Where the agent pulls everything it needs to run a leg (never the dispatch: ADR-0019 §4)."""

    async def voice_session(self, session_id: str) -> VoiceSessionStartResponse: ...


class LegSide(TurnPusher, LegReporter, Protocol):
    """Both halves of the API the leg itself uses. One object, because it is one client."""


class CallSink:
    """Where the live speech providers leave their `AiCallRecord`s.

    Recognition and synthesis happen outside an exchange — a recogniser streams while the candidate
    speaks, and the synthesizer runs while the interviewer does — so their records have no response
    to ride home on. They are collected here and drained into whichever exchange is next pushed,
    which is how a voice session's bill stays complete without a second route (ADR-0007).
    """

    def __init__(self) -> None:
        self._calls: list[AiCallRecord] = []

    def record(self, call: AiCallRecord) -> None:
        self._calls.append(call)

    def drain(self) -> list[AiCallRecord]:
        calls = self._calls
        self._calls = []
        return calls

    def __len__(self) -> int:
        return len(self._calls)


class Clock(Protocol):
    """Wall clock for the record, monotonic for the stopwatch. One object, so a test moves both."""

    def now(self) -> datetime: ...
    def monotonic(self) -> float: ...


class SystemClock:
    """The real one. `now()` is UTC (CLAUDE.md §5) and `monotonic()` never goes backwards."""

    def now(self) -> datetime:
        return datetime.now(UTC)

    def monotonic(self) -> float:
        return time.monotonic()


def elapsed_ms(clock: Clock, since: float) -> int:
    """Whole milliseconds since a monotonic reading, never negative."""
    return max(0, int((clock.monotonic() - since) * 1_000))

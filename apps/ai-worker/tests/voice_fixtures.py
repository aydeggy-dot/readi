"""Doubles for a whole voice leg, with no room, no server, no microphone and no key.

This is what `transport.py`'s Protocols are for. A `FakeSpeaker` records every line the interviewer
says and answers with scripted playback — which is how the barge-in rule, the latency ladder and the
silence prompt are tested at all — and `FakeApi` keeps the pushes so a test can read what the API
would have been sent.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from readi_worker.contracts import (
    InterviewEngineSnapshot,
    InterviewSessionBundle,
    InterviewTurnPush,
    InterviewTurnPushResponse,
    VoiceLegEndedRequest,
    VoiceLegEndedResponse,
    VoiceSessionStartResponse,
)
from readi_worker.voice.barge_in import Playback
from readi_worker.voice.transport import Clip, Utterance
from tests.interview_fixtures import STARTED_AT, bundle

#: The fake synthesizer's own rate, so a test's idea of how long a line takes matches the audio.
SECONDS_PER_CHARACTER = 0.075


class ManualClock:
    """A clock a test moves. Wall clock and monotonic advance together, as they do in life."""

    def __init__(self, start: datetime = STARTED_AT) -> None:
        self._wall = start
        self._seconds = 1_000.0

    def advance(self, seconds: float) -> None:
        self._wall += timedelta(seconds=seconds)
        self._seconds += seconds

    def now(self) -> datetime:
        return self._wall

    def monotonic(self) -> float:
        return self._seconds


@dataclass
class Said:
    """One line the interviewer said, and whether it came from rendered audio."""

    text: str
    pinned: bool


class FakeUtterance:
    def __init__(self, playback: Playback | None, ttfb_ms: int | None) -> None:
        self._playback = playback
        self._ttfb_ms = ttfb_ms

    async def started(self) -> bool:
        return self._playback is not None

    async def settled(self) -> Playback:
        return self._playback or Playback(spoken_ms=0, interrupted=True)

    @property
    def synthesis_ttfb_ms(self) -> int | None:
        return self._ttfb_ms


class FakeSpeaker:
    """Records what was said and answers with playback a test can script.

    `interruptions` is keyed on the line — a test scripts "they talked over the probe" by naming
    the probe — and `silent` is the line whose audio never started at all.
    """

    def __init__(
        self,
        *,
        interruptions: dict[str, Playback] | None = None,
        silent: set[str] | None = None,
        ttfb_ms: int = 120,
    ) -> None:
        self.said: list[Said] = []
        self._interruptions = dict(interruptions or {})
        self._silent = set(silent or ())
        self._ttfb_ms = ttfb_ms

    @property
    def lines(self) -> list[str]:
        return [one.text for one in self.said]

    def say(self, text: str, *, clip: Clip | None = None, interruptible: bool = True) -> Utterance:
        self.said.append(Said(text=text, pinned=clip is not None))
        if text in self._silent:
            return FakeUtterance(None, None)
        scripted = self._interruptions.get(text)
        if scripted is not None:
            return FakeUtterance(scripted, None if clip is not None else self._ttfb_ms)
        played = int(len(text) * SECONDS_PER_CHARACTER * 1_000)
        return FakeUtterance(
            Playback(spoken_ms=played, interrupted=False, total_ms=played),
            None if clip is not None else self._ttfb_ms,
        )


@dataclass
class FakeApi:
    """The API's half, recorded. `fail_pushes` is how many pushes fail before one lands."""

    fail_pushes: int = 0
    pushes: list[InterviewTurnPush] = field(default_factory=list)
    legs: list[VoiceLegEndedRequest] = field(default_factory=list)
    duplicate: bool = False

    async def push(self, session_id: str, push: InterviewTurnPush) -> InterviewTurnPushResponse:
        if self.fail_pushes > 0:
            self.fail_pushes -= 1
            raise RuntimeError("the API is restarting")
        self.pushes.append(push)
        return InterviewTurnPushResponse.model_validate(
            {
                "state": push.state,
                "status": "completed" if push.ended else "in_progress",
                "ended": push.ended,
                "duplicate": self.duplicate,
            }
        )

    async def leg_ended(
        self, session_id: str, request: VoiceLegEndedRequest
    ) -> VoiceLegEndedResponse:
        self.legs.append(request)
        return VoiceLegEndedResponse.model_validate(
            {"duplicate": False, "voice_seconds_total": request.voice_seconds}
        )

    def turns(self, index: int) -> list[object]:
        return list(self.pushes[index].turns)


def start_response(
    deck: InterviewSessionBundle | None = None,
    *,
    snapshot: InterviewEngineSnapshot | None = None,
    resume: bool = False,
    voice_seconds_remaining: int = 1_800,
    now: datetime | None = None,
) -> VoiceSessionStartResponse:
    """What the agent is handed when a leg opens (`GET .../voice-session`)."""
    carried = deck or bundle()
    return VoiceSessionStartResponse.model_validate(
        {
            "bundle": carried.model_dump(mode="json"),
            "engine_snapshot": None if snapshot is None else snapshot.model_dump(mode="json"),
            "resume": resume,
            "room": "interview-test",
            "ends_at": carried.ends_at.isoformat(),
            "now": (
                now or carried.ends_at - timedelta(minutes=carried.planned_minutes)
            ).isoformat(),
            "voice_seconds_remaining": voice_seconds_remaining,
        }
    )

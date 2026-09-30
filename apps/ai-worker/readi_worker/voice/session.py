"""One leg of a voice interview: the same engine, reached by speech (ADR-0019 §1).

**This is the module that has to be right, and it is the module with no LiveKit in it.** Everything
a voice interview does that text mode does not — acknowledge at once, prefetch the next opening,
reassure a silence, notice a barge-in, push what happened — happens here, against the four Protocols
in `transport.py`. A test drives a whole leg with a speaker that records lines and answers with
scripted playback, so the barge-in rule, the latency ladder, the push contents and the end of a leg
are all tested with no room, no server, no microphone and no key.

## One exchange, in order

1. the transport hands over the answer and a `TurnTiming` it started when speech ended;
2. the **acknowledgement** goes out at once, from pre-rendered audio (lever 1) — this is the first
   of the two latency targets, and nothing is decided before it;
3. a pending **prefetch** is awaited if one is in flight, because when there is one the turn it
   phrased is the turn about to be spoken (`machine.settled_next_step`);
4. `InterviewService.advance()` runs — the same call text mode makes, with the same budgets,
   probes, fallbacks and asks guard;
5. each interviewer turn is spoken, from prefetched audio where there is any;
6. the exchange is **pushed** once its audio has settled, and the next prefetch starts.

**The push waits for the audio to settle, and that is a refinement of ADR-0019 §3 rather than a
departure from it.** The ADR's rule is that no database write may sit between the model's answer and
the first audio byte, and none does: by the time we push, the candidate has heard the whole turn or
interrupted it. Waiting is what makes `spoken_ms` and `interrupted` exist to be pushed — they are
not knowable earlier — and a push lost to a crash costs nothing permanent, because the API's stored
snapshot is the authority and the next leg replays from the last exchange that landed (ADR-0016 §4).

## What the driver deliberately does not do

**It does not interpret speech as a command.** No "say stop to skip": the engine owns the flow, and
a model — or a keyword spotter — deciding that a candidate wanted to skip is exactly the authority
`planned_follow_ups` exists to keep away from the interview. `skip()` and `end_early()` are here for
the browser's own controls to call (M5 phase 5).

**It does not re-speak the question after a reconnection.** `resume` means the agent waits
(`VoiceSessionStartResponse`): the captions on screen carry the question that was already asked, so
silence costs the candidate a read rather than a repetition — and re-speaking would need the API to
send the last turn's text, which the contract does not carry. Recorded in the handover as a phase 5
decision to revisit with the captions in front of it.
"""

import asyncio
import contextlib
import logging
import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from readi_worker.contracts import (
    AiCallRecord,
    InterviewAdvanceRequest,
    InterviewAdvanceResponse,
    InterviewEngineSnapshot,
    InterviewTurn,
    InterviewTurnPush,
    VoiceLegEndedRequest,
    VoiceSessionStartResponse,
    VoiceTurnLatency,
)
from readi_worker.interview.service import InterviewService
from readi_worker.speech.base import TranscriptWord as SpeechWord
from readi_worker.voice import acknowledgements as ack
from readi_worker.voice.api_client import new_exchange_id
from readi_worker.voice.barge_in import Playback, heard_turn, spoken_turn
from readi_worker.voice.latency import SpokenTiming, TurnTiming
from readi_worker.voice.pinned_audio import PinnedAudio
from readi_worker.voice.quality import QualityMonitor
from readi_worker.voice.transport import CallSink, Clock, LegSide, Speaker, elapsed_ms

logger = logging.getLogger(__name__)

#: Mirrors `CandidateText`'s own limit in @readi/shared-types. A voice answer is truncated to it
#: rather than refused: eight thousand characters is nine minutes of uninterrupted speech, and a
#: candidate who manages that must lose the tail of one answer rather than the exchange.
ANSWER_MAX_LENGTH = 8_000

#: How long a push queue is allowed to drain when the leg closes. Beyond it the leg ends anyway and
#: the unpushed exchanges are replayed by the next one; holding the room open longer only delays the
#: candidate's report.
DRAIN_TIMEOUT_S = 15.0

#: Why the leg ended. Mirrors `VoiceLegEndReason` in @readi/shared-types — the generated contract
#: inlines it as a Literal on the request, so there is no name to import.
LegEndReason = Literal[
    "completed",
    "fallback_poor_connection",
    "candidate_left",
    "agent_error",
    "session_expired",
    "allowance_exhausted",
]


@dataclass(frozen=True, slots=True)
class LegOutcome:
    """What the leg was, for the record and for the ledger."""

    reason: LegEndReason
    voice_seconds: int
    turns_spoken: int
    ended: bool


class VoiceLeg:
    """The agent's side of one voice interview leg."""

    def __init__(
        self,
        *,
        session_id: str,
        start: VoiceSessionStartResponse,
        service: InterviewService,
        speaker: Speaker,
        pinned: PinnedAudio,
        api: LegSide,
        clock: Clock,
        calls: CallSink,
        quality: QualityMonitor | None = None,
        silence_after_ms: int = ack.TAKE_YOUR_TIME_AFTER_MS,
    ) -> None:
        self._session_id = session_id
        self._bundle = start.bundle
        self._snapshot: InterviewEngineSnapshot | None = start.engine_snapshot
        self._resume = start.resume
        self._allowance_s = start.voice_seconds_remaining
        self._service = service
        self._speaker = speaker
        self._pinned = pinned
        self._api = api
        self._clock = clock
        self._calls = calls
        self._quality = quality or QualityMonitor(clock)
        self._silence_after_ms = silence_after_ms
        self._leg_started = clock.monotonic()
        # The API's clock against ours. `ends_at` is absolute, so skew only matters at the very
        # margin of a budget — but an agent an hour out would end every session immediately, and
        # that is worth seeing in a log rather than in a support ticket.
        self._skew_ms = int((start.now - clock.now()).total_seconds() * 1_000)
        self._answers = 0
        self._turns_spoken = 0
        self._ended = start.engine_snapshot is not None and start.engine_snapshot.state == "ended"
        self._exchange = asyncio.Lock()
        self._silence: asyncio.Task[None] | None = None
        self._prefetch: asyncio.Task[str | None] | None = None
        self._pushes: asyncio.Queue[InterviewTurnPush] = asyncio.Queue()
        self._pusher: asyncio.Task[None] | None = None
        self._closed = False

    # ---- The leg.

    @property
    def ended(self) -> bool:
        """Has the interview itself ended? A leg can end without it (a fallback, a dropped call)."""
        return self._ended

    @property
    def should_fall_back(self) -> bool:
        """Has the connection been bad long enough to stop pretending this is a voice interview?"""
        return self._quality.should_fall_back

    @property
    def allowance_exhausted(self) -> bool:
        """Has the leg used the voice minutes the session had left when it opened?"""
        return self._allowance_s <= self._elapsed_seconds()

    async def open(self) -> None:
        """Render the pinned lines, then greet the candidate — or wait, if this is a second leg."""
        if abs(self._skew_ms) > 5_000:
            logger.warning("voice agent clock is %d ms from the API's", self._skew_ms)
        self._pusher = asyncio.create_task(self._drain_pushes())
        await self._pinned.warm()
        if self._resume or self._ended:
            logger.info(
                "interview %s voice leg resuming; waiting for the candidate", self._session_id
            )
            self._arm_silence()
            return
        async with self._exchange:
            await self._run("start", None, None)

    async def close(self, reason: LegEndReason) -> LegOutcome:
        """Stop, flush what is owed, and meter the minutes. Safe to call twice."""
        if self._closed:
            return self._outcome(reason)
        self._closed = True
        await self._cancel(self._silence)
        await self._cancel(self._prefetch)
        await self._flush()
        outcome = self._outcome(reason)
        try:
            await self._api.leg_ended(
                self._session_id,
                VoiceLegEndedRequest.model_validate(
                    {
                        "leg_id": new_exchange_id(),
                        "reason": outcome.reason,
                        "voice_seconds": outcome.voice_seconds,
                        "turns_spoken": outcome.turns_spoken,
                        "quality": self._quality.summary().model_dump(mode="json"),
                    }
                ),
            )
        except Exception as exc:  # the leg is over: nothing here is worth raising into
            # Minutes not metered is a billing problem, not a candidate's problem, and there is
            # nobody left to tell. The API's own sweep is what notices a session with no leg row.
            logger.warning("voice leg not metered: %s", type(exc).__name__)
        return outcome

    # ---- What the candidate did.

    async def on_answer(
        self,
        transcript: str,
        *,
        timing: TurnTiming,
        words: list[SpeechWord] | None = None,
        confidence: float | None = None,
    ) -> None:
        """One answer, spoken. The whole of an exchange happens inside this call."""
        text = transcript.strip()[:ANSWER_MAX_LENGTH]
        if not text or self._ended or self._closed:
            return
        async with self._exchange:
            await self._cancel(self._silence)
            await self._acknowledge(timing)
            await self._await_prefetch()
            await self._run("answer", text, timing, words=words or [], confidence=confidence)

    async def skip(self) -> None:
        """Pass on this question, or on asking one of their own (the browser's control)."""
        if self._ended or self._closed:
            return
        async with self._exchange:
            await self._cancel(self._silence)
            await self._run("skip", None, None)

    async def end_early(self) -> None:
        """The candidate ended the interview. Their answers stand and the close is still spoken."""
        if self._ended or self._closed:
            return
        async with self._exchange:
            await self._cancel(self._silence)
            await self._run("end", None, None)

    def on_user_started_speaking(self) -> None:
        """The candidate is talking: the silence has ended, whatever it was waiting to say."""
        self._silence_cancelled()

    def note_reconnect(self) -> None:
        self._quality.note_reconnect()

    def note_quality(
        self, *, rtt_ms: int | None, packet_loss_percent: float | None, poor: bool
    ) -> None:
        self._quality.note(rtt_ms=rtt_ms, packet_loss_percent=packet_loss_percent, poor=poor)

    # ---- One exchange.

    async def _run(
        self,
        action: str,
        text: str | None,
        timing: TurnTiming | None,
        *,
        words: list[SpeechWord] | None = None,
        confidence: float | None = None,
    ) -> None:
        if timing is not None:
            timing.engine_entered_ms = self._since(timing)
        response = await self._service.advance(self._request(action, text))
        if response.error is not None:
            await self._refused(response.error)
            return
        if response.engine_snapshot is not None:
            self._snapshot = response.engine_snapshot
        self._ended = response.ended
        if action == "answer":
            self._answers += 1

        speech_calls = self._drain_speech_calls()
        spoken: list[SpokenTiming] = []
        turns: list[InterviewTurn] = []
        for turn in sorted(response.turns, key=lambda one: turn_seq(one)):
            if turn.speaker == "candidate":
                turns.append(heard_turn(turn, words or [], confidence))
                continue
            playback, sample = await self._speak(turn, timing)
            spoken.append(sample)
            turns.append(spoken_turn(turn, playback))
        self._turns_spoken += len(spoken)

        if timing is not None:
            timing.ai_calls = list(response.ai_calls)
        latency = timing.samples(spoken) if timing is not None else []
        await self._enqueue(response, turns, latency, speech_calls)

        if self._ended:
            return
        self._arm_silence()
        self._arm_prefetch()

    async def _speak(
        self, turn: InterviewTurn, timing: TurnTiming | None
    ) -> tuple[Playback | None, SpokenTiming]:
        """Say one interviewer turn, from rendered audio where there is any."""
        clip = self._pinned.get(turn.text)
        utterance = self._speaker.say(turn.text, clip=clip)
        began = await utterance.started()
        response_ms = self._since(timing) if timing is not None else 0
        playback = await utterance.settled() if began else None
        seq = turn_seq(turn)
        return playback, SpokenTiming(
            turn_seq=seq,
            response_ms=response_ms,
            tts_first_byte_ms=utterance.synthesis_ttfb_ms,
            prefetched=clip is not None,
            interrupted=playback.interrupted if playback is not None else True,
        )

    async def _acknowledge(self, timing: TurnTiming) -> None:
        """The first audio the candidate hears. Pinned, rotated, and never evaluative."""
        line = ack.acknowledgement(self._session_id, self._answers)
        utterance = self._speaker.say(line, clip=self._pinned.get(line))
        if await utterance.started():
            timing.acknowledged_ms = self._since(timing)

    async def _refused(self, error: str) -> None:
        """The engine refused the exchange: nothing is stored and nothing was said.

        Only one of these is audible to the candidate. `llm_error` after a question *they* asked is
        the one call with no honest fallback (`interview/calls.py`), and in voice the alternative to
        saying so is silence, which reads as a dropped call.
        """
        logger.info("interview %s voice exchange refused: %s", self._session_id, error)
        if error == "llm_error":
            await self._speaker.say(
                ack.CANNOT_ANSWER, clip=self._pinned.get(ack.CANNOT_ANSWER)
            ).settled()
        self._arm_silence()

    def _request(self, action: str, text: str | None) -> InterviewAdvanceRequest:
        """One `advance` request. The bundle and the snapshot ride on **every** one of them.

        Text mode leans on the worker's Redis cache to avoid resending the pinned questions; the
        agent already holds both in memory, so sending them costs nothing and removes Redis from
        the voice path altogether — no `bundle_required`, and no leg that depends on a cache.
        """
        return InterviewAdvanceRequest.model_validate(
            {
                "session_id": self._session_id,
                "action": action,
                "text": text,
                "now": self._clock.now().isoformat(),
                "bundle": self._bundle.model_dump(mode="json"),
                "engine_snapshot": (
                    None if self._snapshot is None else self._snapshot.model_dump(mode="json")
                ),
            }
        )

    # ---- The push.

    async def _enqueue(
        self,
        response: InterviewAdvanceResponse,
        turns: list[InterviewTurn],
        latency: Sequence[VoiceTurnLatency],
        speech_calls: list[AiCallRecord],
    ) -> None:
        if not turns or response.engine_snapshot is None:
            return
        push = InterviewTurnPush.model_validate(
            {
                "exchange_id": new_exchange_id(),
                "state": response.state,
                "ended": response.ended,
                "end_reason": response.end_reason,
                "turns": [turn.model_dump(mode="json") for turn in turns],
                "engine_snapshot": response.engine_snapshot.model_dump(mode="json"),
                "prompt_versions": {
                    name: version.root for name, version in response.prompt_versions.items()
                },
                # The engine's calls and the speech providers' calls, in one row set: a voice
                # session's bill is the model plus the minutes, and ADR-0007 wants it re-derivable.
                "ai_calls": [
                    *(call.model_dump(mode="json") for call in response.ai_calls),
                    *(call.model_dump(mode="json") for call in speech_calls),
                ],
                "latency": [sample.model_dump(mode="json") for sample in latency],
            }
        )
        await self._pushes.put(push)

    async def _drain_pushes(self) -> None:
        """Push exchanges in the order they happened, one at a time.

        Order is the point. Two pushes in flight could apply an older snapshot over a newer one,
        and the snapshot is what the next leg resumes from.
        """
        while True:
            push = await self._pushes.get()
            try:
                await self._api.push(self._session_id, push)
            except Exception as exc:  # a lost push is recoverable; see the module header
                logger.warning("interview %s push failed: %s", self._session_id, type(exc).__name__)
            finally:
                self._pushes.task_done()

    async def drain(self) -> None:
        """Wait for every queued exchange to have been pushed, or for the queue to give up.

        Public because two callers want it: the leg's own close, and a test that has just made an
        exchange happen and wants to read what was sent.
        """
        with contextlib.suppress(TimeoutError):
            async with asyncio.timeout(DRAIN_TIMEOUT_S):
                await self._pushes.join()

    async def _flush(self) -> None:
        """Wait for what is queued, then stop pushing."""
        await self.drain()
        await self._cancel(self._pusher)

    # ---- The silence, and the prefetch.

    def _arm_silence(self) -> None:
        """Say one reassuring line if the candidate says nothing for a long time."""
        if self._closed or self._ended:
            return
        self._silence_cancelled()
        self._silence = asyncio.create_task(self._reassure())

    async def _reassure(self) -> None:
        await asyncio.sleep(self._silence_after_ms / 1_000)
        # Once. A second "take your time" is the interviewer hurrying somebody along.
        line = ack.TAKE_YOUR_TIME
        await self._speaker.say(line, clip=self._pinned.get(line)).settled()

    def _silence_cancelled(self) -> None:
        task = self._silence
        self._silence = None
        if task is not None and not task.done():
            task.cancel()

    def _arm_prefetch(self) -> None:
        """Phrase and render the next opening while the candidate answers (lever 2)."""
        if self._closed or self._ended:
            return
        self._prefetch = asyncio.create_task(self._prefetch_opening())

    async def _prefetch_opening(self) -> str | None:
        text = await self._service.prefetch_next_opening(
            self._bundle, self._snapshot, self._clock.now()
        )
        if text is not None:
            await self._pinned.render(text)
        return text

    async def _await_prefetch(self) -> None:
        """Wait for a prefetch already in flight, rather than paying for the same phrasing twice.

        There is only ever one to wait for, and when there is one the opening it phrased is the turn
        about to be spoken — the engine had no decision left to take, which is what
        `machine.settled_next_step` means. So this is not added latency: it is the same call, made
        earlier, finishing.
        """
        task = self._prefetch
        self._prefetch = None
        if task is None or task.done():
            return
        with contextlib.suppress(Exception):
            await task

    # ---- Bookkeeping.

    def _drain_speech_calls(self) -> list[AiCallRecord]:
        return [*self._pinned.drain_calls(), *self._calls.drain()]

    def _since(self, timing: TurnTiming) -> int:
        return elapsed_ms(self._clock, timing.started_at)

    def _elapsed_seconds(self) -> int:
        """The leg's length, rounded **up**: a vendor bills the minute a syllable started in."""
        return math.ceil(max(0.0, self._clock.monotonic() - self._leg_started))

    def _outcome(self, reason: LegEndReason) -> LegOutcome:
        return LegOutcome(
            reason=reason,
            voice_seconds=self._elapsed_seconds(),
            turns_spoken=self._turns_spoken,
            ended=self._ended,
        )

    async def _cancel(self, task: "asyncio.Task[object] | None") -> None:
        if task is None or task.done():
            return
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError, Exception):
            await task


def turn_seq(turn: InterviewTurn) -> int:
    """A turn's seq. Named rather than inlined because it is read three times in one exchange:
    to order the turns, to key a latency sample, and to rotate the acknowledgement."""
    return turn.seq

"""The LiveKit agent: the only module here that knows what a room is.

`AgentSession` is given a recogniser, a synthesizer, voice activity detection and a turn detector —
and **no language model**. That is the whole shape of ADR-0019 §1 in one keyword: with `llm=None`
LiveKit does the transport (streaming recognition, endpointing, barge-in, transcription into the
room, reconnection) and decides nothing about the interview, while `session.py` drives the engine M3
built. There is no second state machine, and there is nowhere for one to hide.

Three things in here are less obvious than they look.

**`on_user_turn_completed` is the hook, and it is awaited.** With no language model LiveKit calls it
and then stops — it has no reply to generate — so it is exactly the moment the driver wants: the
turn detector has committed, the final transcript is in hand, and the agent's own speech has already
been interrupted if the candidate talked over it. (Two consequences of `llm=None` are worth knowing:
the user's message is *not* added to LiveKit's chat context, which costs us nothing because the
transcript we keep is the engine's; and `session.generate_reply()` would raise, which is the right
failure for a call nothing here should ever make.)

**Word timings come from the recognition stream or not at all.** `UserInputTranscribedEvent` and the
chat message carry text and a confidence but no timings, so `stt_node` is overridden to read
`SpeechData.words` on the way past. That is the only place they exist, and M6's delivery coaching
cannot be computed from anything else afterwards.

**How much of a turn was actually heard comes from the audio output, not from the speech handle.**
`SpeechHandle` has no playout API; `PlaybackFinishedEvent` on `session.output.audio` carries
`playback_position`, `interrupted` and — in a room session, by default — the
`synchronized_transcript` of what was really spoken. That last one is what makes the barge-in
probe rule exact rather than an estimate (`barge_in.py`).

**What is deliberately not measured yet.** Round-trip time and packet loss are left null: they would
have to be read out of `room.get_rtc_stats()`'s WebRTC objects, and the run that decides the region
is phase 8 stage 1 — the candidate's *browser* reporting `getStats()` over MTN, Airtel, Glo and home
broadband. `QualityMonitor.note()` already takes them, so phase 8 adds a call and not a design.
Reconnects and the sustained-poor rule are live here, because they change what the leg does.
"""

import asyncio
import contextlib
import inspect
import json
import logging
from collections import deque
from collections.abc import AsyncIterable, AsyncIterator
from typing import Any

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    UserStateChangedEvent,
    stt,
)
from livekit.agents.voice import io
from livekit.agents.voice.agent import ModelSettings
from redis.asyncio import Redis

from readi_worker.interview.calls import Interviewer
from readi_worker.interview.phrasings import PhrasingCache
from readi_worker.interview.service import InterviewService
from readi_worker.interview.state_store import InterviewStateStore
from readi_worker.llm.anthropic_client import AnthropicLLMClient
from readi_worker.llm.base import LLMClient
from readi_worker.logging_config import install_pii_filter
from readi_worker.settings import Settings, load_settings
from readi_worker.speech.base import TranscriptWord as SpeechWord
from readi_worker.speech.factory import build_tts, glossary_for
from readi_worker.tracing import TracedLLMClient, build_tracer
from readi_worker.voice.api_client import VoiceApiClient, VoiceApiError
from readi_worker.voice.barge_in import Playback
from readi_worker.voice.latency import TurnTiming
from readi_worker.voice.pinned_audio import PinnedAudio
from readi_worker.voice.quality import QualityMonitor
from readi_worker.voice.session import LegEndReason, VoiceLeg
from readi_worker.voice.streaming import (
    SpeechMeter,
    build_live_stt,
    build_live_tts,
    clip_frames,
)
from readi_worker.voice.transport import CallSink, Clip, Clock, SystemClock, Utterance

logger = logging.getLogger(__name__)

#: The agent has no language model, so its instructions are never sent anywhere. `Agent` requires
#: the argument; this is what a reader of a LiveKit trace should see instead of an empty string.
NO_MODEL_INSTRUCTIONS = (
    "This agent has no language model. The interview is driven by Readi's own state machine"
    " (readi_worker/interview), and every word spoken is either staff-written or phrased by a"
    " separate, structured model call the engine makes itself."
)

#: How long to wait for the candidate to join before giving up on the leg. A dispatch happens
#: because they pressed a button, so this is generous for a slow connection and short enough that a
#: room nobody joins does not hold an agent process.
PARTICIPANT_TIMEOUT_S = 60.0


# -------------------------------------------------------------------------------------------------
# Speaking into a room.


class _RoomUtterance:
    """One thing the interviewer is saying, and what became of it.

    The two futures are resolved by the audio output's own events, which arrive in the order the
    speech was scheduled in; the speech handle's done callback resolves whatever is left, so an
    utterance that never reached the output still settles rather than hanging the exchange.
    """

    def __init__(self, handle: Any, clip: Clip | None) -> None:
        loop = asyncio.get_running_loop()
        self._handle = handle
        self._clip = clip
        self._started: asyncio.Future[bool] = loop.create_future()
        self._settled: asyncio.Future[Playback] = loop.create_future()
        handle.add_done_callback(self._on_handle_done)

    async def started(self) -> bool:
        return await self._started

    async def settled(self) -> Playback:
        return await self._settled

    @property
    def synthesis_ttfb_ms(self) -> int | None:
        """The synthesizer's first byte, from LiveKit's own per-turn metrics.

        None for a pinned or prefetched clip, because nothing was synthesized — which is exactly
        what `VoiceTurnLatency.tts_first_byte_ms` being null means.
        """
        items = getattr(self._handle, "chat_items", None) or []
        metrics = getattr(items[-1], "metrics", None) if items else None
        value = metrics.get("tts_node_ttfb") if isinstance(metrics, dict) else None
        return int(value * 1_000) if isinstance(value, int | float) else None

    def _begin(self) -> None:
        if not self._started.done():
            self._started.set_result(True)

    def _finish(self, event: io.PlaybackFinishedEvent) -> None:
        self._begin()
        if self._settled.done():
            return
        self._settled.set_result(
            Playback(
                spoken_ms=max(0, int(event.playback_position * 1_000)),
                interrupted=event.interrupted,
                total_ms=(
                    int(self._clip.seconds * 1_000)
                    if self._clip is not None and self._clip.seconds is not None
                    else None
                ),
                heard_text=event.synchronized_transcript,
            )
        )

    def _on_handle_done(self, handle: Any) -> None:
        """The turn is over. Anything the audio output did not report never played."""
        if not self._started.done():
            self._started.set_result(False)
        if not self._settled.done():
            self._settled.set_result(
                Playback(spoken_ms=0, interrupted=bool(getattr(handle, "interrupted", False)))
            )


class RoomSpeaker:
    """`Speaker` against a live `AgentSession`."""

    def __init__(self, session: "AgentSession[None]") -> None:
        self._session = session
        self._pending: deque[_RoomUtterance] = deque()

    def attach(self) -> None:
        """Listen to the audio output. Called after `session.start()`, when there is one."""
        audio = self._session.output.audio
        if audio is None:
            logger.warning("voice session has no audio output; barge-in facts will be empty")
            return
        audio.on("playback_started", self._on_started)
        audio.on("playback_finished", self._on_finished)

    def say(self, text: str, *, clip: Clip | None = None, interruptible: bool = True) -> Utterance:
        handle = (
            self._session.say(text, allow_interruptions=interruptible)
            if clip is None
            # Pre-rendered audio bypasses the synthesizer entirely (latency lever 1): the room
            # still gets the transcription, so the captions are the same either way.
            else self._session.say(text, audio=clip_frames(clip), allow_interruptions=interruptible)
        )
        utterance = _RoomUtterance(handle, clip)
        self._pending.append(utterance)
        return utterance

    def _on_started(self, _event: io.PlaybackStartedEvent) -> None:
        for utterance in self._pending:
            if not utterance._started.done():
                utterance._begin()
                return

    def _on_finished(self, event: io.PlaybackFinishedEvent) -> None:
        while self._pending:
            utterance = self._pending[0]
            if utterance._settled.done():
                self._pending.popleft()
                continue
            utterance._finish(event)
            self._pending.popleft()
            return


# -------------------------------------------------------------------------------------------------
# The agent.


class InterviewAgent(Agent):
    """The engine, wearing LiveKit's interface.

    It owns no interview state: `VoiceLeg` does, and this class exists to turn three LiveKit facts
    into calls on it — the recognition stream (for word timings), the end of the candidate's speech
    (for the latency origin), and the turn detector committing (for the exchange).
    """

    def __init__(self, leg: VoiceLeg, clock: Clock) -> None:
        super().__init__(instructions=NO_MODEL_INSTRUCTIONS)
        self._leg = leg
        self._clock = clock
        self._speech_ended_at: float | None = None
        self._speech_ended_wall = clock.now()
        self._stt_final_at: float | None = None
        self._words: list[SpeechWord] = []
        self._confidence: float | None = None

    # ---- Where the candidate's speech is observed.

    async def stt_node(
        self, audio: AsyncIterable[rtc.AudioFrame], model_settings: ModelSettings
    ) -> AsyncIterable[stt.SpeechEvent | str]:
        """The default recognition node, read on the way past for what only it carries.

        Word timings live on `SpeechData.words` and are forwarded nowhere by the session, so this is
        the one place they can be taken. Nothing is changed: every event is yielded onward.
        """
        stream = Agent.default.stt_node(self, audio, model_settings)
        resolved = await stream if inspect.isawaitable(stream) else stream
        if resolved is None:
            return _no_events()  # a session with no recogniser: nothing said, nothing to observe
        return self._observe(resolved)

    async def _observe(
        self, events: AsyncIterable[stt.SpeechEvent | str]
    ) -> AsyncIterator[stt.SpeechEvent | str]:
        async for event in events:
            if isinstance(event, stt.SpeechEvent) and event.alternatives:
                if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                    self._stt_final_at = self._clock.monotonic()
                    best = event.alternatives[0]
                    self._words = _words_of(best)
                    self._confidence = best.confidence or None
                elif event.type == stt.SpeechEventType.START_OF_SPEECH:
                    self._leg.on_user_started_speaking()
            yield event

    def on_user_state_changed(self, event: UserStateChangedEvent) -> None:
        """The candidate stopped speaking: the origin every latency figure is measured from."""
        if event.new_state == "speaking":
            self._leg.on_user_started_speaking()
            self._speech_ended_at = None
            return
        if event.old_state == "speaking":
            self._speech_ended_at = self._clock.monotonic()
            self._speech_ended_wall = self._clock.now()

    # ---- The exchange.

    async def on_user_turn_completed(self, turn_ctx: Any, new_message: Any) -> None:
        """The turn detector has committed. One exchange happens inside this call.

        It is awaited by LiveKit before it would generate a reply — and with `llm=None` there is no
        reply for it to generate, so the whole turn is ours. An exception here is caught and logged
        by LiveKit and the turn is dropped, which would lose an answer silently, so nothing in the
        driver is allowed to raise: `VoiceLeg` is written that way and this is why.
        """
        text = str(getattr(new_message, "text_content", "") or "")
        timing = self._timing()
        words, confidence = self._words, self._confidence
        self._words, self._confidence = [], None
        try:
            await self._leg.on_answer(text, timing=timing, words=words, confidence=confidence)
        except Exception:
            logger.exception("interview voice exchange failed")

    def _timing(self) -> TurnTiming:
        """One turn's stopwatch, with the two stages only the transport can see already filled.

        Falls back to "now" when no end of speech was observed — a candidate whose first audio is
        already a committed turn, which happens with pre-connect audio — and then `endpoint_ms` is
        0 rather than a made-up number.
        """
        now = self._clock.monotonic()
        origin = self._speech_ended_at if self._speech_ended_at is not None else now
        wall = self._speech_ended_wall if self._speech_ended_at is not None else self._clock.now()
        final_at = self._stt_final_at if self._stt_final_at is not None else now
        self._speech_ended_at = None
        self._stt_final_at = None
        return TurnTiming(
            speech_ended_at=wall,
            started_at=origin,
            endpoint_ms=max(0, int((now - origin) * 1_000)),
            stt_final_ms=max(0, int((final_at - origin) * 1_000)),
        )


async def _no_events() -> AsyncIterator[stt.SpeechEvent | str]:
    """An empty recognition stream, for the shape the default node can return but this never has."""
    return
    yield  # pragma: no cover - unreachable, and what makes this an async generator


def _words_of(data: stt.SpeechData) -> list[SpeechWord]:
    """`SpeechData.words` as the contract's own shape. Empty when the provider reports none."""
    words: list[SpeechWord] = []
    for word in data.words or []:
        start = getattr(word, "start_time", None)
        end = getattr(word, "end_time", None)
        # A `TimedString` with no offsets carries `NOT_GIVEN` rather than None, so this is a type
        # check and not a null check — the null check crashed the recognition stream on the first
        # word a provider timed loosely, which is one word's worth of coaching against a whole leg.
        if not isinstance(start, int | float) or not isinstance(end, int | float):
            continue
        words.append(
            SpeechWord(
                text=str(word),
                start_ms=max(0, int(start * 1_000)),
                end_ms=max(0, int(end * 1_000)),
                confidence=getattr(word, "confidence", None),
            )
        )
    return words


# -------------------------------------------------------------------------------------------------
# The job.

server = AgentServer()


def _prewarm(proc: JobProcess) -> None:
    """Load what a job must not wait for: the configuration, and the voice-activity model.

    A cold job otherwise pays for both while the candidate is listening to silence.
    """
    install_pii_filter()
    proc.userdata["settings"] = load_settings()
    with contextlib.suppress(Exception):
        from livekit import local_inference

        local_inference.init_vad()


server.setup_fnc = _prewarm


@server.rtc_session(agent_name="readi-interviewer")
async def entrypoint(ctx: JobContext) -> None:
    """One voice leg, from the dispatch to the ledger.

    The dispatch carries **the session id and nothing else** (ADR-0019 §4): room metadata and data
    channels are readable by participants, and the bundle carries `planned_follow_ups`, which are
    answer key. Everything else is pulled over the service-token channel.
    """
    settings: Settings = ctx.proc.userdata.get("settings") or load_settings()
    session_id = _session_id_of(ctx)
    clock = SystemClock()
    calls = CallSink()

    api = VoiceApiClient(
        settings.api_internal_url,
        settings.service_token.get_secret_value(),
        timeout_s=settings.api_timeout_s,
    )
    try:
        start = await api.voice_session(session_id)
    except VoiceApiError as exc:
        # Nothing has been built, nobody has joined and there is nothing to say: a job that cannot
        # read its own session ends quietly rather than as a traceback in a room. The candidate's
        # browser sees the room stay empty and falls back to text (M5 phase 5).
        logger.error("interview %s voice leg not started: %s", session_id, exc.code)
        await api.aclose()
        return

    llm, tracer, owned_llm = _build_llm(settings)
    redis = Redis.from_url(str(settings.redis_url))
    service = InterviewService(
        Interviewer(llm, settings.llm_model_interviewer, settings.voice_llm_timeout_s),
        InterviewStateStore(redis, settings.interview_state_ttl_s),
        tracer,
        PhrasingCache(),
    )

    recognizer = build_live_stt(settings)
    synthesizer = build_live_tts(settings)
    meter = SpeechMeter(settings, calls, clock)
    meter.watch(recognizer, synthesizer)

    # **No `llm=`, and that is the whole of ADR-0019 §1.** A session with no language model runs
    # the transport and decides nothing: `AgentSession` resolves a missing model to None, calls
    # `on_user_turn_completed` and then stops rather than generating a reply. It is left out rather
    # than passed as None because the keyword's type does not admit None, while the runtime treats
    # "absent" and "none" as the same thing (`agent_session.py:627`).
    session: AgentSession[None] = AgentSession(
        stt=recognizer,
        tts=synthesizer,
        turn_handling={
            "interruption": {"enabled": True},
            # Pointless without a model to generate ahead of time, and it would double our own
            # prefetch: the engine already phrases the next opening when it is settled.
            "preemptive_generation": {"enabled": False},
        },
        # The driver has its own silence prompt, said once, in the interviewer's own words.
        user_away_timeout=None,
    )
    speaker = RoomSpeaker(session)
    quality = QualityMonitor(clock)
    leg = VoiceLeg(
        session_id=session_id,
        start=start,
        service=service,
        speaker=speaker,
        pinned=PinnedAudio(build_tts(settings), model=settings.tts_model, voice=settings.tts_voice),
        api=api,
        clock=clock,
        calls=calls,
        quality=quality,
    )
    agent = InterviewAgent(leg, clock)
    session.on("user_state_changed", agent.on_user_state_changed)

    reason: LegEndReason = "agent_error"
    try:
        await ctx.connect()
        _watch_room(ctx, leg)
        await session.start(agent, room=ctx.room)
        speaker.attach()
        logger.info(
            "interview %s voice leg open: stt=%s tts=%s glossary=%d terms",
            session_id,
            settings.stt_provider,
            settings.tts_provider,
            len(glossary_for(settings, "streaming")),
        )
        if not await _await_candidate(ctx):
            logger.info("interview %s voice leg: nobody joined", session_id)
            reason = "candidate_left"
        else:
            await leg.open()
            reason = await _wait_for_the_end(ctx, leg)
    except Exception:
        logger.exception("interview %s voice leg failed", session_id)
        reason = "agent_error"
    finally:
        meter.finalize()
        await leg.close(reason)
        with contextlib.suppress(Exception):
            await session.aclose()
        await api.aclose()
        await tracer.aclose()
        if owned_llm is not None:
            await owned_llm.aclose()
        await redis.aclose()
        logger.info("interview %s voice leg closed: %s", session_id, reason)


def _session_id_of(ctx: JobContext) -> str:
    """The session id out of the dispatch metadata, which is a JSON object with one field."""
    raw = ctx.job.metadata or ""
    try:
        payload = json.loads(raw)
    except ValueError:
        payload = None
    if isinstance(payload, dict) and isinstance(payload.get("session_id"), str):
        return str(payload["session_id"])
    raise RuntimeError("voice dispatch carried no session_id (ADR-0019 §4)")


def _build_llm(settings: Settings) -> tuple[LLMClient, Any, AnthropicLLMClient | None]:
    """The interviewer's model client, traced the way every other model call in the worker is.

    The tracing wrapper goes on here for the same reason it goes on in `main.py`: a model call made
    inside a voice leg is a model call, and "did you trace this one?" is not a question anybody
    should have to ask of a new entry point (M3 phase 5).
    """
    from readi_worker.cv.parse import keyword_extraction
    from readi_worker.interview.fake_script import FakeInterviewerLLMClient
    from readi_worker.llm.fake import FunctionLLMClient

    tracer = build_tracer(settings)
    if settings.llm_provider == "fake":
        # The same stand-in `main.py` builds, minus the evaluator's: a voice leg makes the
        # interviewer's two call shapes and nothing else.
        fake = FakeInterviewerLLMClient(FunctionLLMClient(keyword_extraction))
        return TracedLLMClient(fake, tracer), tracer, None
    if settings.anthropic_api_key is None:  # guaranteed by Settings validation
        raise RuntimeError("ANTHROPIC_API_KEY missing")
    client = AnthropicLLMClient(
        settings.anthropic_api_key.get_secret_value(), timeout_s=settings.llm_timeout_s
    )
    return TracedLLMClient(client, tracer), tracer, client


def _watch_room(ctx: JobContext, leg: VoiceLeg) -> None:
    """Reconnects, connection quality and the candidate leaving.

    LiveKit recovers a dropped connection by itself, so a reconnect is counted rather than acted
    on — but a leg with six of them is what explains a bad latency table afterwards.
    """

    def on_reconnected() -> None:
        leg.note_reconnect()

    def on_quality(participant: rtc.Participant, quality: rtc.ConnectionQuality) -> None:
        if participant.identity == ctx.room.local_participant.identity:
            return  # our own leg to the server, not the candidate's.
        leg.note_quality(
            rtt_ms=None,
            packet_loss_percent=None,
            poor=quality
            in (rtc.ConnectionQuality.QUALITY_POOR, rtc.ConnectionQuality.QUALITY_LOST),
        )

    ctx.room.on("reconnected", on_reconnected)
    ctx.room.on("connection_quality_changed", on_quality)


async def _wait_for_the_end(ctx: JobContext, leg: VoiceLeg) -> LegEndReason:
    """Why this leg is over. Whichever comes first, checked once a second.

    A poll rather than a set of races: each of these is a different object's event, the leg is at
    most half an hour, and a second of delay in *noticing* the end costs a candidate nothing.
    """
    while True:
        if leg.ended:
            return "completed"
        if leg.should_fall_back:
            return "fallback_poor_connection"
        if leg.allowance_exhausted:
            return "allowance_exhausted"
        if not _candidate_present(ctx):
            return "candidate_left"
        await asyncio.sleep(1.0)


def _candidate_present(ctx: JobContext) -> bool:
    """Is anybody still in the room with us? A leg with nobody left in it is over.

    Only asked after they have joined (`_await_candidate`), because a browser takes a moment to
    connect and an agent that gave up on an empty room would end every session before it started.
    """
    if not ctx.room.isconnected():
        return False
    return bool(ctx.room.remote_participants)


async def _await_candidate(ctx: JobContext) -> bool:
    """Wait for the candidate to join before greeting them.

    The greeting is the one turn a candidate waits for with nothing on the screen, and speaking it
    into an empty room would spend it on nobody: `session.say` plays to whoever is subscribed now.
    """
    with contextlib.suppress(TimeoutError):
        async with asyncio.timeout(PARTICIPANT_TIMEOUT_S):
            await ctx.wait_for_participant()
            return True
    return False

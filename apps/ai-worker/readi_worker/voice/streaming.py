"""The live speech path: LiveKit's streaming interfaces, our provider choice, our cost records.

M5 phase 1 decided that `speech/base.py` stays **batch** and the live conversation runs on LiveKit
Agents' plugin for the chosen provider (ADR-0019 §2, amended at phase 3): streaming recognition with
interim results and endpointing, and streaming synthesis, are what `AgentSession` expects to be
handed, and writing a second streaming stack beside it would be two implementations of one thing.

What that leaves for us is the two jobs the interface in `speech/base.py` does, and this module does
them for the live path:

**Provider selection in one place.** `build_live_stt` / `build_live_tts` are the only functions that
turn a provider *name* into an implementation, exactly as `speech/factory.py` is for the batch path.
No vendor is named anywhere else, and `Settings` has already refused an unknown or unpriced one.

**A cost record per call.** Every `AiCallRecord` for the live path is produced here, from LiveKit's
own `STTMetrics` and `TTSMetrics` — which is a hook rather than a wrapper, so nothing about a
plugin's internals has to be re-implemented to bill it. The rules are `speech/pricing.py`'s, and the
session-billed case is why this exists at all: **AssemblyAI's streaming product bills the time the
socket was open**, not the audio inside it, and an interview is mostly silence while the candidate
thinks. So a session-billed vendor produces **one** record at the end of the leg, priced on the
socket's own lifetime, and an audio-billed vendor produces one per recognition.

## Two things this deliberately does not do

**No vendor plugin is installed yet**, because no vendor has been chosen: that is phase 6's
decision, taken on real recordings (ADR-0020). `_STT_PLUGINS` names the extra each provider needs,
and asking for one that is not installed fails with that name in the message rather than with an
`ImportError` from three frames down. The fakes below are what a local run and the e2e suite use,
and they are what makes the whole voice path testable with no key, no network and no cost.

**LiveKit Inference is not used.** `livekit.agents.inference.STT/TTS` would reach Deepgram or
ElevenLabs through LiveKit's own gateway, billed by LiveKit at rates that are not in
`speech/pricing.py` — so the worker could not price a call it made, which is the one thing the
owner's instruction of 2026-09-29 forbids. Our keys, our rates, our records.
"""

import io
import logging
import wave
from collections.abc import AsyncIterator
from typing import Any

from livekit import rtc
from livekit.agents import APIConnectOptions, stt, tts
from livekit.agents.language import LanguageCode
from livekit.agents.metrics import STTMetrics, TTSMetrics
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    NotGivenOr,
    TimedString,
)
from livekit.agents.utils.audio import AudioByteStream

from readi_worker.contracts import AiCallRecord
from readi_worker.settings import Settings
from readi_worker.speech import fake as batch_fake
from readi_worker.speech.pricing import (
    stt_billing_basis,
    stt_cost_micro_usd,
    tts_cost_micro_usd,
)
from readi_worker.tracing import current_trace_id
from readi_worker.voice.transport import CallSink, Clip, Clock

logger = logging.getLogger(__name__)

#: Which extra installs the plugin for each provider. Phase 6 chooses one and adds it to
#: `pyproject.toml`; until then this table is what explains the failure.
_STT_PLUGINS = {
    "deepgram": ("livekit.plugins.deepgram", "livekit-agents[deepgram]"),
    "assemblyai": ("livekit.plugins.assemblyai", "livekit-agents[assemblyai]"),
    # Intron publishes a batch HTTP endpoint and no streaming product, so there is no plugin to
    # install and never will be: it is a benchmark reference, not a live recogniser.
    "intron": (None, None),
}
_TTS_PLUGINS = {"elevenlabs": ("livekit.plugins.elevenlabs", "livekit-agents[elevenlabs]")}

#: What the room plays and what the recogniser is given. 24 kHz is `AudioOutputOptions`' own
#: default, so pinned audio resampled to it costs the forwarder nothing.
ROOM_SAMPLE_RATE = 24_000
#: 20 ms frames: small enough that an interruption cuts the audio where the candidate heard it stop.
FRAME_MS = 20


class LiveSpeechUnavailableError(RuntimeError):
    """A provider was configured whose streaming plugin this build does not carry."""


def build_live_stt(settings: Settings) -> stt.STT[Any]:
    """The recogniser the live path uses. `fake` reaches no network and costs nothing."""
    if settings.stt_provider == "fake":
        return FakeLiveStt()
    entry = _STT_PLUGINS.get(settings.stt_provider)
    module, extra = entry if entry else (None, None)
    raise LiveSpeechUnavailableError(
        f"STT_PROVIDER={settings.stt_provider!r} has no streaming plugin in this build"
        + (
            f": add {extra} to apps/ai-worker/pyproject.toml and build it in "
            f"{module} (M5 phase 6 chooses the recogniser on real recordings, ADR-0020)"
            if extra
            else " and publishes no streaming product; it is a benchmark reference only"
        )
    )


def build_live_tts(settings: Settings) -> tts.TTS[Any]:
    """The synthesizer the live path uses."""
    if settings.tts_provider == "fake":
        return FakeLiveTts()
    entry = _TTS_PLUGINS.get(settings.tts_provider)
    module, extra = entry if entry else (None, None)
    raise LiveSpeechUnavailableError(
        f"TTS_PROVIDER={settings.tts_provider!r} has no streaming plugin in this build"
        + (
            f": add {extra} to apps/ai-worker/pyproject.toml and build it in {module} "
            "(M5 phase 7 chooses the voice with a blind panel)"
            if extra
            else ""
        )
    )


# -------------------------------------------------------------------------------------------------
# Cost records for the live path.


class SpeechMeter:
    """`AiCallRecord`s for live recognition and synthesis, from LiveKit's own metrics.

    Attached to the provider objects rather than wrapped around them: the base classes emit
    `metrics_collected` for every request, including the ones a plugin makes internally, so nothing
    can happen on the live path without a record — which is the property `ai_call_log` needs.
    """

    def __init__(self, settings: Settings, sink: CallSink, clock: Clock) -> None:
        self._settings = settings
        self._sink = sink
        self._clock = clock
        self._audio_seconds = 0.0
        self._socket_opened_at: float | None = None
        self._session_billed = (
            stt_billing_basis(settings.stt_provider, settings.stt_model, "streaming") == "session"
        )

    def watch(self, recognizer: stt.STT[Any], synthesizer: tts.TTS[Any]) -> None:
        recognizer.on("metrics_collected", self._on_stt)
        synthesizer.on("metrics_collected", self._on_tts)

    def _on_stt(self, metrics: STTMetrics) -> None:
        self._audio_seconds += max(0.0, metrics.audio_duration)
        if self._socket_opened_at is None:
            self._socket_opened_at = self._clock.monotonic()
        if self._session_billed:
            # One record at the end of the leg instead: this vendor bills the socket, and a record
            # per recognition would either price each one on the whole session (multiplying the
            # bill by the number of turns) or on its audio (understating it about threefold).
            return
        self._sink.record(self._stt_record(metrics.audio_duration, metrics.duration))

    def _on_tts(self, metrics: TTSMetrics) -> None:
        self._sink.record(
            AiCallRecord.model_validate(
                {
                    "purpose": "tts",
                    "provider": self._settings.tts_provider,
                    "model": self._settings.tts_model,
                    "status": "ok",
                    "error_code": None,
                    "latency_ms": max(0, int(metrics.ttfb * 1_000)),
                    "input_units": max(0, metrics.characters_count),
                    "output_units": 0,
                    "cache_write_units": 0,
                    "cache_read_units": 0,
                    "unit_kind": "characters",
                    "cost_micro_usd": tts_cost_micro_usd(
                        self._settings.tts_provider,
                        self._settings.tts_model,
                        max(0, metrics.characters_count),
                    ),
                    "langfuse_trace_id": current_trace_id(),
                }
            )
        )

    def finalize(self) -> None:
        """The session-billed recognition record, written once the socket is closed.

        Also the operational rule this makes visible: **the agent closing its socket is what stops
        the bill**. A leg that leaks its recogniser connection bills for hours of a session nobody
        is in (`docs/progress/2026-09-29-m5-providers.md`).
        """
        if not self._session_billed or self._socket_opened_at is None:
            return
        open_seconds = max(0.0, self._clock.monotonic() - self._socket_opened_at)
        self._sink.record(self._stt_record(self._audio_seconds, 0.0, session_seconds=open_seconds))
        self._socket_opened_at = None
        self._audio_seconds = 0.0

    def _stt_record(
        self, audio_seconds: float, duration: float, *, session_seconds: float | None = None
    ) -> AiCallRecord:
        seconds = max(0, -(-int(audio_seconds * 1_000) // 1_000))  # whole seconds, rounded up
        return AiCallRecord.model_validate(
            {
                "purpose": "stt",
                "provider": self._settings.stt_provider,
                "model": self._settings.stt_model,
                "status": "ok",
                "error_code": None,
                "latency_ms": max(0, int(duration * 1_000)),
                # Always the **audio** seconds, even where the cost is the socket's: the units
                # column is a record of what was said, and the cost column of what was billed.
                "input_units": seconds,
                "output_units": 0,
                "cache_write_units": 0,
                "cache_read_units": 0,
                "unit_kind": "seconds",
                "cost_micro_usd": stt_cost_micro_usd(
                    self._settings.stt_provider,
                    self._settings.stt_model,
                    "streaming",
                    audio_seconds=seconds,
                    session_seconds=session_seconds,
                ),
                "langfuse_trace_id": current_trace_id(),
            }
        )


# -------------------------------------------------------------------------------------------------
# Pre-rendered audio into the room.


async def clip_frames(clip: Clip) -> AsyncIterator[rtc.AudioFrame]:
    """A rendered clip as frames for `session.say(audio=...)`, which then makes no synthesis call.

    A WAV is unpacked here — the header says the rate, the forwarder resamples to the room's, and
    nothing needs a codec. Anything else (the synthesizer's mp3) goes through LiveKit's decoder,
    which needs `av`; it is a dependency of `livekit-agents` already, so this costs nothing but is
    worth knowing about when the real synthesizer arrives in phase 7.
    """
    if clip.content_type in ("audio/wav", "audio/x-wav", "audio/wave"):
        for frame in _wav_frames(clip.audio):
            yield frame
        return
    from livekit.agents.utils.codecs import AudioStreamDecoder

    decoder = AudioStreamDecoder(
        sample_rate=ROOM_SAMPLE_RATE, num_channels=1, format=clip.content_type
    )
    decoder.push(clip.audio)
    decoder.end_input()
    try:
        async for frame in decoder:
            yield frame
    finally:
        await decoder.aclose()


def _wav_frames(audio: bytes) -> list[rtc.AudioFrame]:
    with wave.open(io.BytesIO(audio), "rb") as handle:
        rate = handle.getframerate()
        channels = handle.getnchannels()
        if handle.getsampwidth() != 2:
            raise ValueError("pre-rendered audio must be 16-bit PCM")
        pcm = handle.readframes(handle.getnframes())
    stream = AudioByteStream(rate, channels, samples_per_channel=max(1, rate * FRAME_MS // 1_000))
    return [*stream.push(pcm), *stream.flush()]


# -------------------------------------------------------------------------------------------------
# The fakes: a real streaming recogniser and synthesizer that reach nothing.


class FakeLiveStt(stt.STT[Any]):
    """Recognition without a provider: the batch fake's answers, on LiveKit's streaming interface.

    It hears one of `speech/fake.py`'s answers per turn, derived from the audio it was given, so a
    local voice session says something a person can read in a test failure. Word timings are spread
    evenly, which is a lie about real speech and the right lie here (M5 phase 1).
    """

    def __init__(self, script: list[str] | None = None) -> None:
        super().__init__(capabilities=stt.STTCapabilities(streaming=True, interim_results=True))
        self._batch = batch_fake.FakeSpeechToText(script or [])

    @property
    def model(self) -> str:
        return "fake"

    @property
    def provider(self) -> str:
        return "fake"

    async def _recognize_impl(
        self,
        buffer: rtc.AudioFrame | list[rtc.AudioFrame],
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        return await _fake_event(self._batch, buffer)

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.RecognizeStream:
        return _FakeSttStream(stt=self, batch=self._batch, conn_options=conn_options)


class _FakeSttStream(stt.RecognizeStream):
    def __init__(
        self,
        *,
        stt: FakeLiveStt,
        batch: batch_fake.FakeSpeechToText,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(stt=stt, conn_options=conn_options)
        self._batch = batch
        self._buffer: list[rtc.AudioFrame] = []

    async def _run(self) -> None:
        async for frame in self._input_ch:
            if isinstance(frame, stt.RecognizeStream._FlushSentinel):
                if not self._buffer:
                    continue
                event = await _fake_event(self._batch, list(self._buffer))
                self._buffer.clear()
                self._event_ch.send_nowait(event)
                self._event_ch.send_nowait(stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH))
                continue
            self._buffer.append(frame)


async def _fake_event(
    batch: batch_fake.FakeSpeechToText, buffer: rtc.AudioFrame | list[rtc.AudioFrame]
) -> stt.SpeechEvent:
    frames = buffer if isinstance(buffer, list) else [buffer]
    combined = rtc.combine_audio_frames(frames) if frames else None
    audio = bytes(combined.data) if combined is not None else b""
    rate = combined.sample_rate if combined is not None else ROOM_SAMPLE_RATE
    result = await batch.transcribe(
        model="fake", audio=audio, content_type="audio/pcm", language="en"
    )
    seconds = len(audio) / (rate * 2) if rate else 0.0
    return stt.SpeechEvent(
        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
        request_id="fake",
        alternatives=[
            stt.SpeechData(
                language=LanguageCode("en"),
                text=result.text,
                confidence=result.confidence or 0.9,
                start_time=0.0,
                end_time=seconds,
                words=_timed(result.text, seconds),
            )
        ],
    )


def _timed(text: str, seconds: float) -> list[TimedString]:
    """Evenly spaced word timings. A `TimedString` is a `str` subclass carrying its own offsets."""
    words = text.split()
    if not words:
        return []
    step = (seconds / len(words)) if seconds > 0 else 0.0
    return [
        TimedString(word, start_time=index * step, end_time=(index + 1) * step)
        for index, word in enumerate(words)
    ]


class FakeLiveTts(tts.TTS[Any]):
    """Synthesis without a provider: silence of a plausible length, streamed.

    The length is what makes a latency or metering test mean anything, and it is the batch fake's
    own rate so the two agree about how long a line takes to say.
    """

    def __init__(self) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=ROOM_SAMPLE_RATE,
            num_channels=1,
        )

    @property
    def model(self) -> str:
        return "fake"

    @property
    def provider(self) -> str:
        return "fake"

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.ChunkedStream:
        return _FakeChunked(tts=self, input_text=text, conn_options=conn_options)

    def stream(
        self, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> tts.SynthesizeStream:
        return _FakeSynthesizeStream(tts=self, conn_options=conn_options)


def _silence(text: str) -> bytes:
    seconds = min(len(text) * batch_fake._SECONDS_PER_CHARACTER, 120.0)
    return b"\x00\x00" * int(ROOM_SAMPLE_RATE * seconds)


class _FakeChunked(tts.ChunkedStream):
    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        output_emitter.initialize(
            request_id="fake",
            sample_rate=ROOM_SAMPLE_RATE,
            num_channels=1,
            mime_type="audio/pcm",
        )
        output_emitter.push(_silence(self._input_text))
        output_emitter.flush()


class _FakeSynthesizeStream(tts.SynthesizeStream):
    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        output_emitter.initialize(
            request_id="fake",
            sample_rate=ROOM_SAMPLE_RATE,
            num_channels=1,
            mime_type="audio/pcm",
            stream=True,
        )
        segment = 0
        buffered = ""
        async for token in self._input_ch:
            if isinstance(token, tts.SynthesizeStream._FlushSentinel):
                if not buffered:
                    continue
                output_emitter.start_segment(segment_id=f"fake-{segment}")
                output_emitter.push(_silence(buffered))
                output_emitter.end_segment()
                segment += 1
                buffered = ""
                continue
            buffered += token

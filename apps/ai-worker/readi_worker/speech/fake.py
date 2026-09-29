"""Speech without a provider: deterministic recognition and synthesis for development and tests.

`STT_PROVIDER=fake` and `TTS_PROVIDER=fake` are the resting state of the stack, for the same reason
`LLM_PROVIDER=fake` is (the M3 decision): a voice session bills by the minute, a dev stack is left
running for days, and nothing here reaches a network or a key.

Both fakes are pure functions of their input, so a test that runs twice gets the same transcript and
the same audio — and a scripted variant exists for tests that need a particular answer or a
particular failure, mirroring `ScriptedEmbeddingProvider`.
"""

import hashlib
import io
import wave
from collections.abc import Sequence

from readi_worker.speech.base import (
    SttError,
    Synthesis,
    TranscriptionResult,
    TranscriptWord,
    TtsError,
)

#: What the fake recogniser hears. Short answers in the register a candidate actually uses, so a
#: transcript from the fake is readable in a test failure instead of being noise.
_HEARD = (
    "we queue the write and retry it with a backoff",
    "i would add an index on the column we filter by",
    "the test was flaky because it waited for a fixed time",
    "i asked the backend team for the contract before writing the mock",
    "we cache the response and invalidate it when the order changes",
)

#: The fake's audio, and the rate it assumes for anything it cannot read a header from.
_SAMPLE_RATE = 16_000
_SAMPLE_WIDTH = 2
#: Roughly 150 words a minute at five characters a word, which is what a calm interviewer sounds
#: like. It only has to be plausible: nothing listens to this audio, and the length is what makes a
#: latency or metering test mean anything.
_SECONDS_PER_CHARACTER = 0.075
#: However long the text, the fake never allocates more than this much silence.
_MAX_SYNTHESIS_SECONDS = 120.0


class FakeSpeechToText:
    """Answers from the audio itself: same bytes, same transcript. No network, no key, no cost."""

    provider = "fake"

    def __init__(self, script: Sequence[str] | None = None) -> None:
        #: Answers to give in order before falling back to the hash-derived ones (e2e, tests).
        self._script = list(script or [])

    async def transcribe(
        self,
        *,
        model: str,
        audio: bytes,
        content_type: str,
        language: str,
        keyterms: Sequence[str] = (),
        audio_url: str | None = None,
        timeout_s: float | None = None,
    ) -> TranscriptionResult:
        seconds = audio_seconds(audio, content_type)
        text = self._script.pop(0) if self._script else _derived(audio)
        return TranscriptionResult(
            text=text,
            words=_spread(text, seconds),
            provider=self.provider,
            model=model,
            audio_seconds=seconds,
            latency_ms=0,
            confidence=0.9,
        )


#: A scripted step: what was heard, or what went wrong.
SttStep = str | Exception


class ScriptedSpeechToText:
    """Returns the scripted steps in order and records every call (tests)."""

    provider = "fake"

    def __init__(self, steps: Sequence[SttStep]) -> None:
        self._steps = list(steps)
        self.calls: list[dict[str, object]] = []

    async def transcribe(
        self,
        *,
        model: str,
        audio: bytes,
        content_type: str,
        language: str,
        keyterms: Sequence[str] = (),
        audio_url: str | None = None,
        timeout_s: float | None = None,
    ) -> TranscriptionResult:
        self.calls.append(
            {
                "model": model,
                "bytes": len(audio),
                "content_type": content_type,
                "language": language,
                "keyterms": list(keyterms),
            }
        )
        step = self._steps.pop(0)
        if isinstance(step, Exception):
            raise step
        seconds = audio_seconds(audio, content_type)
        return TranscriptionResult(
            text=step,
            words=_spread(step, seconds),
            provider=self.provider,
            model=model,
            audio_seconds=seconds,
            latency_ms=1,
            confidence=0.9,
        )


class FakeTextToSpeech:
    """Returns silence of a plausible length, as a real WAV file that a player can open."""

    provider = "fake"

    async def synthesize(
        self, *, model: str, voice: str, text: str, timeout_s: float | None = None
    ) -> Synthesis:
        seconds = min(len(text) * _SECONDS_PER_CHARACTER, _MAX_SYNTHESIS_SECONDS)
        return Synthesis(
            audio=silent_wav(seconds),
            content_type="audio/wav",
            characters=len(text),
            provider=self.provider,
            model=model,
            voice=voice,
            latency_ms=0,
            audio_seconds=seconds,
        )


#: A scripted step: audio to return, or what went wrong.
TtsStep = bytes | Exception


class ScriptedTextToSpeech:
    """Returns the scripted steps in order and records every call (tests)."""

    provider = "fake"

    def __init__(self, steps: Sequence[TtsStep]) -> None:
        self._steps = list(steps)
        self.calls: list[dict[str, object]] = []

    async def synthesize(
        self, *, model: str, voice: str, text: str, timeout_s: float | None = None
    ) -> Synthesis:
        self.calls.append({"model": model, "voice": voice, "text": text})
        step = self._steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return Synthesis(
            audio=step,
            content_type="audio/wav",
            characters=len(text),
            provider=self.provider,
            model=model,
            voice=voice,
            latency_ms=1,
            audio_seconds=None,
        )


class FakeSttError(SttError):
    def __init__(self, code: str = "ConnectError") -> None:
        super().__init__(code, provider="fake", model="fake", latency_ms=1)


class FakeTtsError(TtsError):
    def __init__(self, code: str = "ConnectError") -> None:
        super().__init__(code, provider="fake", model="fake", voice="fake", latency_ms=1)


def audio_seconds(audio: bytes, content_type: str) -> float:
    """How long the audio plays: read from the header for WAV, estimated otherwise.

    The estimate assumes the fake's own 16 kHz mono PCM. It is wrong for a compressed clip, and
    deliberately so — nothing bills on a fake, and a benchmark clip is a WAV whose header is read.
    """
    if content_type in ("audio/wav", "audio/x-wav", "audio/wave"):
        try:
            with wave.open(io.BytesIO(audio), "rb") as handle:
                rate = handle.getframerate() or _SAMPLE_RATE
                return handle.getnframes() / rate
        except (wave.Error, EOFError):
            pass  # Not a readable WAV after all; fall through to the estimate.
    return len(audio) / (_SAMPLE_RATE * _SAMPLE_WIDTH)


def silent_wav(seconds: float) -> bytes:
    """A real, playable WAV of silence — a shape a player and `wave` both accept."""
    frames = max(0, int(seconds * _SAMPLE_RATE))
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(_SAMPLE_WIDTH)
        handle.setframerate(_SAMPLE_RATE)
        handle.writeframes(b"\x00" * frames * _SAMPLE_WIDTH)
    return buffer.getvalue()


def _derived(audio: bytes) -> str:
    """One of the fixed answers, chosen by the audio, so two clips differ and one clip repeats."""
    digest = hashlib.blake2b(audio, digest_size=8).digest()
    return _HEARD[int.from_bytes(digest, "big") % len(_HEARD)]


def _spread(text: str, seconds: float) -> list[TranscriptWord]:
    """Word timings spread evenly across the audio.

    Even spacing is a lie about real speech, and it is the right lie here: M6's delivery metrics
    read these offsets, and a fake that invented pauses would make a pace test pass on the fake's
    rhythm rather than on the code.
    """
    words = text.split()
    if not words:
        return []
    step_ms = max(1, int(seconds * 1_000 / len(words)))
    return [
        TranscriptWord(
            text=word, start_ms=index * step_ms, end_ms=(index + 1) * step_ms, confidence=0.9
        )
        for index, word in enumerate(words)
    ]

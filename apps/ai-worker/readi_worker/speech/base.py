"""Speech adapter interfaces (CLAUDE.md "AI provider adapters", M5 phase 1).

Mirrors `llm/base.py` and `embeddings/base.py`: business logic depends on the Protocol, provider
SDKs live in the implementations, and latency is measured inside the adapter so every provider
reports it the same way.

## These are the batch interfaces, and that is a decision

A voice interview needs *streaming* recognition with interim results and endpointing, and streaming
synthesis. That path is LiveKit Agents' plugin for the chosen provider (ADR-0019 §2): writing our
own streaming stack beside it would be two implementations of the same thing, and the plugin is what
`AgentSession` expects to be handed. What phase 3 wraps around that plugin is provider selection and
`AiCallRecord` reporting — the same two jobs this interface does — so the seam CLAUDE.md asks for is
kept without pretending we hand-rolled a realtime pipeline.

What is left for these interfaces is everything that is **not** a live conversation, and it is not
small:

- the accent benchmark transcribes files and compares them to a reference (`/evals/stt_benchmark`);
- the interviewer's pinned acknowledgements and connectives are synthesized once and cached, which
  is the whole of latency lever 1 (ADR-0019 §5);
- the voice panel in phase 7 synthesizes the same lines in several voices to be compared;
- and the fakes below are what let an end-to-end voice test run with no key, no network and no cost.

## Units

Recognition is billed per second of audio and synthesis per character, so both results carry the
figure they are billed on and `speech/calls.py` turns it into an `AiCallRecord` with the matching
`unit_kind` (ADR-0007). Neither has an input/output split and neither caches, which is why they are
not `LLMResult`.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class TranscriptWord:
    """One word as the recogniser timed it. Offsets are from the start of the audio."""

    text: str
    start_ms: int
    end_ms: int
    #: The recogniser's own confidence, where it reports one. Never shown to a candidate.
    confidence: float | None = None


@dataclass(frozen=True)
class TranscriptionResult:
    """One transcription. `audio_seconds` is what it is billed on, as the provider reports it."""

    text: str
    words: list[TranscriptWord]
    provider: str
    model: str
    audio_seconds: float
    latency_ms: int
    #: Confidence over the whole transcript, where the provider reports one.
    confidence: float | None = None


class SttError(Exception):
    """The recogniser could not be reached, or rejected the audio."""

    def __init__(self, code: str, *, provider: str, model: str, latency_ms: int) -> None:
        super().__init__(code)
        self.code = code
        self.provider = provider
        self.model = model
        self.latency_ms = latency_ms


class SpeechToText(Protocol):
    provider: str

    async def transcribe(
        self,
        *,
        model: str,
        audio: bytes,
        content_type: str,
        language: str,
        keyterms: Sequence[str] = (),
        timeout_s: float | None = None,
    ) -> TranscriptionResult:
        """Transcribe one piece of audio. Raises `SttError` if the provider could not answer.

        `keyterms` is the custom vocabulary from `content/glossary/tech_terms.txt`, passed on every
        call rather than configured once: it is the same list the benchmark scores its tech-term
        subset against, so a provider cannot be tuned for the test without being tuned for the
        product (ADR-0020 §7). A provider that takes fewer than it is given keeps the first of them
        — the file's order is its priority order.
        """
        ...


@dataclass(frozen=True)
class Synthesis:
    """One synthesis. `characters` is what it is billed on: the text as it was sent."""

    audio: bytes
    content_type: str
    characters: int
    provider: str
    model: str
    voice: str
    latency_ms: int
    #: How long the audio plays, where the provider reports it or the format makes it readable.
    audio_seconds: float | None = None


class TtsError(Exception):
    """The synthesizer could not be reached, or rejected the text."""

    def __init__(
        self, code: str, *, provider: str, model: str, voice: str, latency_ms: int
    ) -> None:
        super().__init__(code)
        self.code = code
        self.provider = provider
        self.model = model
        self.voice = voice
        self.latency_ms = latency_ms


class TextToSpeech(Protocol):
    provider: str

    async def synthesize(
        self, *, model: str, voice: str, text: str, timeout_s: float | None = None
    ) -> Synthesis:
        """Speak `text` in `voice`. Raises `TtsError` if the provider could not answer."""
        ...

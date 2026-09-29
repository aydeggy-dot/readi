"""Building the configured speech adapters (M5 phase 1).

The one place a provider **name** turns into an implementation, so no business logic ever mentions a
vendor (CLAUDE.md "AI provider adapters"). `Settings` has already refused an unknown name and an
unpriced one by the time this runs, so a `RuntimeError` here means the registry in `providers.py`
and this file have gone out of step — which is what the test asserts they never do.

Adding a provider in phase 2 is three lines: a name in `providers.py`, a price in `pricing.py`, and
a branch here.
"""

from pathlib import Path

from readi_worker.settings import Settings
from readi_worker.speech.assemblyai import AssemblyAiSpeechToText
from readi_worker.speech.base import SpeechToText, TextToSpeech
from readi_worker.speech.deepgram import DeepgramSpeechToText
from readi_worker.speech.elevenlabs import ElevenLabsTextToSpeech
from readi_worker.speech.fake import FakeSpeechToText, FakeTextToSpeech
from readi_worker.speech.glossary import default_glossary_path, load_terms
from readi_worker.speech.intron import IntronSpeechToText
from readi_worker.speech.providers import STT_VENDORS, CallPath


def build_stt(settings: Settings) -> SpeechToText:
    if settings.stt_provider == "fake":
        return FakeSpeechToText()
    key = settings.stt_key
    if key is None:  # guaranteed by Settings validation
        raise RuntimeError(f"no key for {settings.stt_provider}")
    secret = key.get_secret_value()
    timeout = settings.stt_timeout_s
    if settings.stt_provider == "deepgram":
        return DeepgramSpeechToText(secret, timeout_s=timeout)
    if settings.stt_provider == "assemblyai":
        return AssemblyAiSpeechToText(secret, timeout_s=timeout)
    if settings.stt_provider == "intron":
        return IntronSpeechToText(secret, timeout_s=timeout)
    raise RuntimeError(f"no speech-to-text implementation for {settings.stt_provider}")


def build_tts(settings: Settings) -> TextToSpeech:
    if settings.tts_provider == "fake":
        return FakeTextToSpeech()
    key = settings.tts_key
    if key is None:  # guaranteed by Settings validation
        raise RuntimeError(f"no key for {settings.tts_provider}")
    if settings.tts_provider == "elevenlabs":
        return ElevenLabsTextToSpeech(key.get_secret_value(), timeout_s=settings.tts_timeout_s)
    raise RuntimeError(f"no text-to-speech implementation for {settings.tts_provider}")


def glossary_for(settings: Settings, path: CallPath = "streaming") -> list[str]:
    """The custom vocabulary this deployment sends to the recogniser, already capped for the vendor.

    The cap is applied here rather than left to the caller because exceeding it is not a warning —
    Deepgram answers with an error above 500 keyterm tokens — and because the caps differ by vendor
    *and* by path: 100 on either live path, 1,000 for an AssemblyAI batch call. Our glossary is 302
    terms, so something is always dropped, and the file's order is what decides which technical
    words a candidate can afford to have misheard.

    A vendor with no custom-vocabulary feature at all (Intron) has a cap of 0 and gets nothing,
    which is the truth rather than a failure.

    `GLOSSARY_PATH` overrides the checkout's copy, for an image that carries no repository.
    """
    limit = STT_VENDORS[settings.stt_provider].keyterm_limit[path]
    if limit == 0:
        return []
    source = Path(settings.glossary_path) if settings.glossary_path else default_glossary_path()
    return load_terms(source, limit=limit)

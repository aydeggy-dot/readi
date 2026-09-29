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
from readi_worker.speech.base import SpeechToText, TextToSpeech
from readi_worker.speech.fake import FakeSpeechToText, FakeTextToSpeech
from readi_worker.speech.glossary import default_glossary_path, load_terms


def build_stt(settings: Settings) -> SpeechToText:
    if settings.stt_provider == "fake":
        return FakeSpeechToText()
    raise RuntimeError(f"no speech-to-text implementation for {settings.stt_provider}")


def build_tts(settings: Settings) -> TextToSpeech:
    if settings.tts_provider == "fake":
        return FakeTextToSpeech()
    raise RuntimeError(f"no text-to-speech implementation for {settings.tts_provider}")


def glossary_for(settings: Settings, *, limit: int | None = None) -> list[str]:
    """The custom vocabulary this deployment sends to the recogniser.

    `GLOSSARY_PATH` overrides the checkout's copy, for an image that carries no repository. `limit`
    is the provider's cap on keyterms, passed by whoever knows it — the adapter, not this function.
    """
    path = Path(settings.glossary_path) if settings.glossary_path else default_glossary_path()
    return load_terms(path, limit=limit)

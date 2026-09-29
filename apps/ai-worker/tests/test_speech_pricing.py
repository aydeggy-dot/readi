"""What a voice session costs, and the refusal that stops one costing an unknown amount."""

import pytest

from readi_worker.settings import SettingsError, load_settings
from readi_worker.speech import pricing
from readi_worker.speech.base import SttError, Synthesis, TranscriptionResult, TtsError
from readi_worker.speech.calls import (
    stt_error_record,
    stt_record,
    tts_error_record,
    tts_record,
)

TOKEN = "t" * 40


def test_recognition_is_priced_per_audio_minute(monkeypatch: pytest.MonkeyPatch) -> None:
    # A vendor quoting $0.0077 a minute is 7,700 micro-USD a minute; 15 minutes is 115,500 — 11.55c,
    # which is the STT line of the M5 cost table.
    monkeypatch.setitem(pricing.STT_PRICES_PER_MINUTE, ("vendor", "model"), 7_700)
    assert pricing.stt_cost_micro_usd("vendor", "model", 60) == 7_700
    assert pricing.stt_cost_micro_usd("vendor", "model", 15 * 60) == 115_500


def test_synthesis_is_priced_per_thousand_characters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(pricing.TTS_PRICES_PER_1K_CHARACTERS, ("vendor", "model"), 50_000)
    assert pricing.tts_cost_micro_usd("vendor", "model", 1_000) == 50_000
    # 2,600 characters is about what an interviewer says in a 15-minute session.
    assert pricing.tts_cost_micro_usd("vendor", "model", 2_600) == 130_000


def test_the_fake_costs_nothing_without_being_a_special_case() -> None:
    assert pricing.has_stt_price("fake", "fake")
    assert pricing.has_tts_price("fake", "fake")
    assert pricing.stt_cost_micro_usd("fake", "fake", 900) == 0
    assert pricing.tts_cost_micro_usd("fake", "fake", 4_000) == 0


def test_an_unpriced_pair_costs_zero_and_says_so(caplog: pytest.LogCaptureFixture) -> None:
    """The backstop, not the normal path: startup refuses an unpriced provider."""
    assert pricing.stt_cost_micro_usd("nobody", "nothing", 60) == 0
    assert "no speech-to-text price" in caplog.text


def test_a_transcription_is_recorded_in_seconds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(pricing.STT_PRICES_PER_MINUTE, ("vendor", "model"), 7_700)
    record = stt_record(
        TranscriptionResult(
            text="we queue the write",
            words=[],
            provider="vendor",
            model="model",
            audio_seconds=30.2,
            latency_ms=410,
        )
    )
    assert record.purpose == "stt"
    assert record.unit_kind == "seconds"
    # Rounded **up**: an estimate should never come in under the invoice.
    assert record.input_units == 31
    assert record.output_units == 0
    assert record.cost_micro_usd == round(31 / 60 * 7_700)


def test_a_synthesis_is_recorded_in_characters(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(pricing.TTS_PRICES_PER_1K_CHARACTERS, ("vendor", "model"), 50_000)
    record = tts_record(
        Synthesis(
            audio=b"",
            content_type="audio/wav",
            characters=240,
            provider="vendor",
            model="model",
            voice="a-voice",
            latency_ms=180,
        )
    )
    assert record.unit_kind == "characters"
    assert record.input_units == 240
    assert record.cost_micro_usd == 12_000


def test_a_failed_call_is_still_recorded() -> None:
    """It took time and it says something about the provider; it just cost nothing."""
    stt = stt_error_record(SttError("timeout", provider="v", model="m", latency_ms=2_000))
    tts = tts_error_record(TtsError("429", provider="v", model="m", voice="x", latency_ms=90))
    assert (stt.status, stt.cost_micro_usd) == ("error", 0)
    assert (tts.status, tts.cost_micro_usd) == ("error", 0)
    assert stt.error_code is not None
    assert stt.error_code.root == "timeout"
    assert tts.error_code is not None
    assert tts.error_code.root == "429"


def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("ANTHROPIC_API_KEY", "ENVIRONMENT", "EMBEDDING_PROVIDER", "VOYAGE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")


def test_an_unknown_provider_is_refused_with_the_list(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setenv("STT_PROVIDER", "deepgram")

    with pytest.raises(SettingsError, match="not implemented"):
        load_settings(env_file=None)


def test_a_provider_with_no_price_cannot_start(monkeypatch: pytest.MonkeyPatch) -> None:
    """The owner's rule, 2026-09-29: a per-minute vendor bills monthly, so an unpriced one is a cost
    nobody sees until the invoice. This is the shape of the mistake it is there to catch — a
    provider
    added to the registry in phase 2 with its rate forgotten."""
    _env(monkeypatch)
    monkeypatch.setattr(
        "readi_worker.speech.providers.STT_PROVIDERS", frozenset({"fake", "deepgram"})
    )
    monkeypatch.setenv("STT_PROVIDER", "deepgram")
    monkeypatch.setenv("STT_MODEL", "nova-3")

    with pytest.raises(SettingsError, match="no price is configured for deepgram/nova-3"):
        load_settings(env_file=None)


def test_the_same_rule_applies_to_synthesis(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setattr(
        "readi_worker.speech.providers.TTS_PROVIDERS", frozenset({"fake", "elevenlabs"})
    )
    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    monkeypatch.setenv("TTS_MODEL", "flash-v3")

    with pytest.raises(SettingsError, match="no price is configured for elevenlabs/flash-v3"):
        load_settings(env_file=None)


def test_a_priced_provider_starts(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setattr(
        "readi_worker.speech.providers.STT_PROVIDERS", frozenset({"fake", "deepgram"})
    )
    monkeypatch.setitem(pricing.STT_PRICES_PER_MINUTE, ("deepgram", "nova-3"), 7_700)
    monkeypatch.setenv("STT_PROVIDER", "deepgram")
    monkeypatch.setenv("STT_MODEL", "nova-3")

    assert load_settings(env_file=None).stt_provider == "deepgram"


def test_the_fakes_are_refused_in_production_only_when_voice_is_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A text-only deployment needs no recogniser, and every deployment is text-only until M5 ships.
    Refusing `fake` unconditionally would stop the API's own worker booting."""
    _env(monkeypatch)
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("EMBEDDING_PROVIDER", "voyage")
    monkeypatch.setenv("VOYAGE_API_KEY", "vo-test")

    assert load_settings(env_file=None).voice_enabled is False

    monkeypatch.setenv("VOICE_ENABLED", "true")
    with pytest.raises(SettingsError, match="VOICE_ENABLED=true"):
        load_settings(env_file=None)

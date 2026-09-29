"""What a voice session costs, and the refusals that stop one costing an unknown amount."""

import pytest

from readi_worker.settings import SettingsError, load_settings
from readi_worker.speech import pricing
from readi_worker.speech.base import SttError, Synthesis, TranscriptionResult, TtsError
from readi_worker.speech.calls import stt_error_record, stt_record, tts_error_record, tts_record
from readi_worker.speech.pricing import SttRate, TtsRate

TOKEN = "t" * 40
KEY = "k" * 20


def test_recognition_is_priced_per_audio_minute() -> None:
    """Deepgram's regular streaming nova-3 rate is $0.0077/min = 7,700 micro-USD; a 15-minute
    interview is 115,500, or 11.55c, which is the STT line of the M5 cost table."""
    assert pricing.stt_cost_micro_usd("deepgram", "nova-3", "streaming", audio_seconds=60) == 7_700
    assert (
        pricing.stt_cost_micro_usd("deepgram", "nova-3", "streaming", audio_seconds=15 * 60)
        == 115_500
    )


def test_the_same_model_costs_different_amounts_on_the_two_paths() -> None:
    """Why the path is in the key: nova-3 is $0.0077/min live and $0.0043 pre-recorded."""
    live = pricing.stt_cost_micro_usd("deepgram", "nova-3", "streaming", audio_seconds=600)
    batch = pricing.stt_cost_micro_usd("deepgram", "nova-3", "batch", audio_seconds=600)
    assert (live, batch) == (77_000, 43_000)


def test_a_session_billed_vendor_refuses_to_be_priced_on_audio_alone() -> None:
    """AssemblyAI's streaming product bills the time the socket was open: "A WebSocket open for 60
    minutes with 30 minutes of audio sent is billed for 60 minutes." An interview is mostly silence
    while the candidate thinks, so pricing it on audio would understate it about threefold — and a
    plausible wrong number is worse than a refusal, because nobody can check it afterwards."""
    with pytest.raises(ValueError, match="bills on session duration"):
        pricing.stt_cost_micro_usd(
            "assemblyai", "universal-streaming-en", "streaming", audio_seconds=300
        )

    # Given both, it bills the session and ignores the audio: 15 minutes at $0.15/hour = 3.75c.
    cost = pricing.stt_cost_micro_usd(
        "assemblyai",
        "universal-streaming-en",
        "streaming",
        audio_seconds=300,
        session_seconds=900,
    )
    assert cost == 37_500


def test_the_basis_is_readable_without_pricing_anything() -> None:
    assert pricing.stt_billing_basis("deepgram", "nova-3", "streaming") == "audio"
    assert (
        pricing.stt_billing_basis("assemblyai", "universal-streaming-en", "streaming") == "session"
    )
    assert pricing.stt_billing_basis("nobody", "nothing", "batch") is None


def test_synthesis_is_priced_per_thousand_characters() -> None:
    """ElevenLabs: $0.04/1k for Flash, $0.08 for the multilingual models, and the rate is the same
    on
    every self-serve plan — a plan buys a dollar balance, not a discount."""
    assert pricing.tts_cost_micro_usd("elevenlabs", "eleven_flash_v2_5", 1_000) == 40_000
    assert pricing.tts_cost_micro_usd("elevenlabs", "eleven_multilingual_v2", 1_000) == 80_000
    # ~2,600 characters is about what an interviewer says in a 15-minute session: 10.4c on Flash.
    assert pricing.tts_cost_micro_usd("elevenlabs", "eleven_flash_v2_5", 2_600) == 104_000


def test_intron_is_deliberately_unpriced() -> None:
    """They publish no pricing at all — not a rate, not a "contact sales" page. Absent from the
    table
    is the honest state, and it is what stops the worker starting with them configured."""
    assert not pricing.has_stt_price("intron", "sahara-v2", "batch")
    assert not pricing.has_stt_price("intron", "sahara-v2", "streaming")


def test_the_fake_costs_nothing_without_being_a_special_case() -> None:
    assert pricing.has_stt_price("fake", "fake", "streaming")
    assert pricing.has_tts_price("fake", "fake")
    assert pricing.stt_cost_micro_usd("fake", "fake", "streaming", audio_seconds=900) == 0
    assert pricing.tts_cost_micro_usd("fake", "fake", 4_000) == 0


def test_every_rate_names_the_page_it_was_read_from_and_when() -> None:
    """A rate is only as good as the page it came from — the Voyage estimate being the
    counter-example, still marked unverified three milestones on."""
    for stt in pricing.STT_RATES.values():
        assert stt.checked.startswith("20")
        assert len(stt.checked) == 10
        assert stt.source
    for tts in pricing.TTS_RATES.values():
        assert tts.checked.startswith("20")
        assert tts.source


def test_an_unpriced_pair_costs_zero_and_says_so(caplog: pytest.LogCaptureFixture) -> None:
    """The backstop, not the normal path: startup refuses an unpriced provider."""
    assert pricing.stt_cost_micro_usd("nobody", "nothing", "batch", audio_seconds=60) == 0
    assert "no speech-to-text price" in caplog.text


def test_a_transcription_is_recorded_in_seconds() -> None:
    record = stt_record(
        TranscriptionResult(
            text="we queue the write",
            words=[],
            provider="deepgram",
            model="nova-3",
            audio_seconds=30.2,
            latency_ms=410,
        )
    )
    assert record.purpose == "stt"
    assert record.unit_kind == "seconds"
    # Rounded **up**: an estimate should never come in under the invoice.
    assert record.input_units == 31
    assert record.output_units == 0
    assert record.cost_micro_usd == round(31 / 60 * 4_300)  # batch is the default path


def test_the_units_column_stays_audio_even_when_the_bill_is_session_time() -> None:
    """The row has to be able to show that the two differ — that is what makes the cost
    re-derivable rather than taken on trust (ADR-0007)."""
    record = stt_record(
        TranscriptionResult(
            text="…",
            words=[],
            provider="assemblyai",
            model="universal-streaming-en",
            audio_seconds=300,
            latency_ms=120,
        ),
        path="streaming",
        session_seconds=900,
    )
    assert record.input_units == 300
    assert record.cost_micro_usd == 37_500


def test_a_synthesis_is_recorded_in_characters() -> None:
    record = tts_record(
        Synthesis(
            audio=b"",
            content_type="audio/mpeg",
            characters=240,
            provider="elevenlabs",
            model="eleven_flash_v2_5",
            voice="a-voice",
            latency_ms=180,
        )
    )
    assert record.unit_kind == "characters"
    assert record.input_units == 240
    assert record.cost_micro_usd == 9_600


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


# ---- Startup refusals.


def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in (
        "ANTHROPIC_API_KEY",
        "ENVIRONMENT",
        "EMBEDDING_PROVIDER",
        "VOYAGE_API_KEY",
        "STT_PROVIDER",
        "STT_MODEL",
        "TTS_PROVIDER",
        "TTS_MODEL",
        "VOICE_ENABLED",
        "DEEPGRAM_API_KEY",
        "ASSEMBLYAI_API_KEY",
        "INTRON_API_KEY",
        "ELEVENLABS_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SERVICE_TOKEN", TOKEN)
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")


def test_an_unknown_provider_is_refused_with_the_list(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setenv("STT_PROVIDER", "whisper-somewhere")

    with pytest.raises(SettingsError, match="not implemented"):
        load_settings(env_file=None)


def test_a_provider_with_no_price_cannot_start(monkeypatch: pytest.MonkeyPatch) -> None:
    """The owner's rule, 2026-09-29. Intron is the live example: they publish no pricing, so they
    cannot be configured as the running recogniser however good their accent coverage turns out to
    be. It is also the shape of the mistake the rule is for — a provider added with its rate
    forgotten."""
    _env(monkeypatch)
    monkeypatch.setenv("STT_PROVIDER", "intron")
    monkeypatch.setenv("STT_MODEL", "sahara-v2")
    monkeypatch.setenv("INTRON_API_KEY", KEY)

    with pytest.raises(SettingsError, match="no price is configured for intron/sahara-v2"):
        load_settings(env_file=None)


def test_a_real_provider_needs_its_key(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setenv("STT_PROVIDER", "deepgram")
    monkeypatch.setenv("STT_MODEL", "nova-3")

    with pytest.raises(SettingsError, match="DEEPGRAM_API_KEY is required"):
        load_settings(env_file=None)

    monkeypatch.setenv("DEEPGRAM_API_KEY", KEY)
    settings = load_settings(env_file=None)
    assert settings.stt_provider == "deepgram"
    assert settings.stt_key is not None
    # And it is a SecretStr, so it cannot be printed by accident.
    assert KEY not in repr(settings)


def test_the_synthesizer_is_held_to_the_same_two_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    monkeypatch.setenv("TTS_MODEL", "eleven_flash_v2_5")

    with pytest.raises(SettingsError, match="ELEVENLABS_API_KEY is required"):
        load_settings(env_file=None)

    monkeypatch.setenv("ELEVENLABS_API_KEY", KEY)
    monkeypatch.setenv("TTS_MODEL", "eleven_hypothetical_v9")
    with pytest.raises(SettingsError, match="no price is configured for elevenlabs/"):
        load_settings(env_file=None)


def test_a_priced_and_keyed_provider_starts(monkeypatch: pytest.MonkeyPatch) -> None:
    _env(monkeypatch)
    monkeypatch.setenv("STT_PROVIDER", "assemblyai")
    monkeypatch.setenv("STT_MODEL", "universal-streaming-en")
    monkeypatch.setenv("ASSEMBLYAI_API_KEY", KEY)

    assert load_settings(env_file=None).stt_provider == "assemblyai"


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


# ---- The vendor facts that code depends on.


def test_every_vendor_declares_how_our_audio_stays_out_of_its_training_set() -> None:
    """Either code can assert it — a parameter or a base URL — or it is an account-level switch and
    therefore a documented gap. Silence is the one state that is not allowed."""
    from readi_worker.speech.providers import STT_VENDORS, TTS_VENDORS

    for stt in STT_VENDORS.values():
        assert stt.privacy.strip(), stt.name
        assert stt.checked.startswith("20")
    for tts in TTS_VENDORS.values():
        assert tts.privacy.strip(), tts.name
        assert tts.checked.startswith("20")


def test_the_two_privacy_mechanisms_code_can_assert() -> None:
    """Deepgram's opt-out parameter and AssemblyAI's EU host are the two levers that live in code,
    so
    a change to either is a change to what we have promised a candidate."""
    from readi_worker.speech.providers import STT_VENDORS

    assert STT_VENDORS["deepgram"].always_send["mip_opt_out"] == "true"
    assert STT_VENDORS["assemblyai"].base_url == "https://api.eu.assemblyai.com"
    # And Intron's LLM post-correction is off, because a rewritten transcript is a benchmark
    # confound and, in a report that quotes the candidate, a hallucination.
    assert STT_VENDORS["intron"].always_send["use_disable_llm_corrections"] == "true"


def test_no_live_path_accepts_the_whole_glossary() -> None:
    """302 terms against caps of 100: the file's priority order is what decides which technical
    words
    a candidate can afford to have misheard, and that is a product decision, not a truncation."""
    from readi_worker.speech.glossary import load_terms
    from readi_worker.speech.providers import STT_VENDORS

    terms = len(load_terms())
    for name in ("deepgram", "assemblyai"):
        assert STT_VENDORS[name].keyterm_limit["streaming"] < terms


def test_word_offsets_come_in_two_different_units() -> None:
    """Deepgram reports seconds and AssemblyAI milliseconds. M6's pace coaching reads these, so the
    adapters convert and this is where the fact is written down."""
    from readi_worker.speech.providers import STT_VENDORS

    assert STT_VENDORS["deepgram"].timing_unit == "seconds"
    assert STT_VENDORS["assemblyai"].timing_unit == "milliseconds"


def test_a_rate_is_a_record_not_a_number() -> None:
    assert isinstance(pricing.STT_RATES[("deepgram", "nova-3", "streaming")], SttRate)
    assert isinstance(pricing.TTS_RATES[("elevenlabs", "eleven_flash_v2_5")], TtsRate)

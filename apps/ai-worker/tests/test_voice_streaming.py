"""The live speech path: the fakes on LiveKit's own interfaces, and one cost record per call.

These are the tests that keep a voice leg free. They also pin the two things about billing that are
easy to get wrong and invisible until an invoice arrives: which vendor bills audio and which bills
the socket, and that the units column stays the audio either way.
"""

import wave

import pytest
from livekit.agents import stt
from livekit.agents.metrics import STTMetrics, TTSMetrics

from readi_worker.settings import Settings
from readi_worker.speech.fake import silent_wav
from readi_worker.voice.streaming import (
    FakeLiveStt,
    FakeLiveTts,
    LiveSpeechUnavailableError,
    SpeechMeter,
    build_live_stt,
    build_live_tts,
    clip_frames,
)
from readi_worker.voice.transport import CallSink, Clip
from tests.conftest import SERVICE_TOKEN
from tests.voice_fixtures import ManualClock


def voice_settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "_env_file": None,
        "environment": "test",
        "redis_url": "redis://127.0.0.1:16379/0",
        "service_token": SERVICE_TOKEN,
        "llm_provider": "fake",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]  # validated by the model


def stt_metrics(audio_duration: float, duration: float = 0.0) -> STTMetrics:
    return STTMetrics(
        label="fake",
        request_id="r1",
        timestamp=0.0,
        duration=duration,
        audio_duration=audio_duration,
        streamed=True,
    )


def tts_metrics(characters: int, ttfb: float = 0.08) -> TTSMetrics:
    return TTSMetrics(
        label="fake",
        request_id="r1",
        timestamp=0.0,
        ttfb=ttfb,
        duration=1.0,
        audio_duration=1.2,
        cancelled=False,
        characters_count=characters,
        streamed=True,
    )


# ---- Provider selection.


def test_the_fakes_are_what_a_local_run_gets() -> None:
    settings = voice_settings()
    assert isinstance(build_live_stt(settings), FakeLiveStt)
    assert isinstance(build_live_tts(settings), FakeLiveTts)


def test_a_provider_with_no_streaming_plugin_says_which_extra_it_needs() -> None:
    # Phase 6 chooses the recogniser on real recordings; until then the plugin is not installed,
    # and the failure has to name what to install rather than arrive as an ImportError.
    settings = voice_settings(
        stt_provider="deepgram", stt_model="nova-3", deepgram_api_key="key-0123456789"
    )
    with pytest.raises(LiveSpeechUnavailableError) as raised:
        build_live_stt(settings)
    assert "livekit-agents[deepgram]" in str(raised.value)


def test_a_vendor_with_no_streaming_product_says_so_rather_than_naming_a_plugin() -> None:
    # Intron publishes no rates, so `Settings` refuses it at startup and a valid configuration
    # naming it cannot be built — which is the rule working. `model_construct` skips that
    # validation, because what is under test here is the factory's own branch.
    settings = Settings.model_construct(stt_provider="intron", stt_model="whisper-large-nigerian")
    with pytest.raises(LiveSpeechUnavailableError) as raised:
        build_live_stt(settings)
    assert "benchmark reference" in str(raised.value)


# ---- Cost records.


def test_an_audio_billed_recogniser_records_every_recognition() -> None:
    sink = CallSink()
    meter = SpeechMeter(
        voice_settings(
            stt_provider="deepgram", stt_model="nova-3", deepgram_api_key="key-0123456789"
        ),
        sink,
        ManualClock(),
    )
    meter._on_stt(stt_metrics(12.4, duration=0.2))
    meter.finalize()

    calls = sink.drain()
    assert len(calls) == 1
    assert calls[0].purpose == "stt"
    assert calls[0].unit_kind == "seconds"
    assert calls[0].input_units == 13  # whole seconds, rounded up
    assert calls[0].cost_micro_usd > 0
    assert calls[0].latency_ms == 200


def test_a_session_billed_recogniser_records_once_on_the_socket_it_held() -> None:
    # AssemblyAI's streaming product bills the time the socket was open, not the audio in it, and
    # an interview is mostly silence: one record per recognition would be wrong either way round.
    clock = ManualClock()
    sink = CallSink()
    meter = SpeechMeter(
        voice_settings(
            stt_provider="assemblyai",
            stt_model="universal-streaming-en",
            assemblyai_api_key="key-0123456789",
        ),
        sink,
        clock,
    )
    meter._on_stt(stt_metrics(20.0))
    meter._on_stt(stt_metrics(30.0))
    assert sink.drain() == []  # nothing yet: the socket is still open

    clock.advance(900.0)
    meter.finalize()
    calls = sink.drain()
    assert len(calls) == 1
    # The units are the audio; the cost is the socket. A row has to be able to show both.
    assert calls[0].input_units == 50
    fifteen_minutes = 900 / 60
    assert calls[0].cost_micro_usd == pytest.approx(fifteen_minutes * 2_500, rel=0.01)


def test_finalizing_twice_bills_one_socket() -> None:
    clock = ManualClock()
    sink = CallSink()
    meter = SpeechMeter(
        voice_settings(
            stt_provider="assemblyai",
            stt_model="universal-streaming-en",
            assemblyai_api_key="key-0123456789",
        ),
        sink,
        clock,
    )
    meter._on_stt(stt_metrics(20.0))
    clock.advance(60.0)
    meter.finalize()
    meter.finalize()
    assert len(sink.drain()) == 1


def test_synthesis_is_billed_on_the_characters_sent() -> None:
    sink = CallSink()
    meter = SpeechMeter(
        voice_settings(
            tts_provider="elevenlabs",
            tts_model="eleven_flash_v2_5",
            tts_voice="wale",
            elevenlabs_api_key="key-0123456789",
        ),
        sink,
        ManualClock(),
    )
    meter._on_tts(tts_metrics(1_000, ttfb=0.075))

    calls = sink.drain()
    assert len(calls) == 1
    assert calls[0].purpose == "tts"
    assert calls[0].unit_kind == "characters"
    assert calls[0].input_units == 1_000
    assert calls[0].latency_ms == 75
    assert calls[0].cost_micro_usd == 40_000  # $0.04 per 1k characters


def test_the_fake_costs_nothing_and_needs_no_exception() -> None:
    sink = CallSink()
    meter = SpeechMeter(voice_settings(), sink, ManualClock())
    meter._on_stt(stt_metrics(30.0))
    meter._on_tts(tts_metrics(500))
    meter.finalize()
    assert [call.cost_micro_usd for call in sink.drain()] == [0, 0]


# ---- The fakes on LiveKit's interfaces.


async def test_the_fake_recogniser_hears_something_a_person_can_read() -> None:
    recognizer = FakeLiveStt()
    stream = recognizer.stream()
    from livekit import rtc

    frame = rtc.AudioFrame(
        data=b"\x00\x00" * 16_000, sample_rate=16_000, num_channels=1, samples_per_channel=16_000
    )
    stream.push_frame(frame)
    stream.flush()
    stream.end_input()

    events = [event async for event in stream]
    await stream.aclose()
    finals = [event for event in events if event.type == stt.SpeechEventType.FINAL_TRANSCRIPT]
    assert len(finals) == 1
    best = finals[0].alternatives[0]
    assert best.text
    assert best.words  # word timings, which is the only place they exist (M6 reads them)
    assert best.words[0].start_time is not None


async def test_the_fake_synthesizer_returns_audio_of_a_plausible_length() -> None:
    synthesizer = FakeLiveTts()
    audio = await synthesizer.synthesize("Okay, thanks.").collect()
    # Roughly 13 characters at the fake's own rate: about a second, which is what makes a latency
    # or metering test mean anything.
    assert 0.5 < audio.duration < 2.0


# ---- Pre-rendered audio into the room.


async def test_a_rendered_wav_becomes_frames_without_a_codec() -> None:
    audio = silent_wav(0.5)
    with wave.open(__import__("io").BytesIO(audio), "rb") as handle:
        rate = handle.getframerate()
    frames = [frame async for frame in clip_frames(Clip(audio=audio, content_type="audio/wav"))]
    assert frames
    assert all(frame.sample_rate == rate for frame in frames)
    total = sum(frame.samples_per_channel for frame in frames)
    assert total == pytest.approx(rate * 0.5, rel=0.02)


async def test_audio_that_is_not_16_bit_pcm_is_refused_rather_than_played_as_noise() -> None:
    with pytest.raises(ValueError, match="16-bit"):
        [
            frame
            async for frame in clip_frames(Clip(audio=_eight_bit_wav(), content_type="audio/wav"))
        ]


def _eight_bit_wav() -> bytes:
    import io

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(1)
        handle.setframerate(16_000)
        handle.writeframes(b"\x80" * 1_600)
    return buffer.getvalue()

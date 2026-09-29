"""The fake recogniser and synthesizer: deterministic, and shaped like the real thing."""

import io
import wave

import pytest

from readi_worker.speech.base import SpeechToText, TextToSpeech
from readi_worker.speech.fake import (
    FakeSpeechToText,
    FakeSttError,
    FakeTextToSpeech,
    FakeTtsError,
    ScriptedSpeechToText,
    ScriptedTextToSpeech,
    audio_seconds,
    silent_wav,
)

# The Protocols are structural, so this is where they are checked: mypy fails here if a fake stops
# matching the interface business logic depends on.
_stt: SpeechToText = FakeSpeechToText()
_tts: TextToSpeech = FakeTextToSpeech()

CLIP = silent_wav(3.0)


async def test_the_same_audio_is_always_heard_the_same_way() -> None:
    stt = FakeSpeechToText()
    first = await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")
    second = await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")
    assert first.text == second.text


async def test_different_audio_is_heard_differently() -> None:
    """Otherwise a test with two answers in it passes on one answer repeated."""
    stt = FakeSpeechToText()
    heard = set()
    for seconds in (1.0, 2.0, 3.0, 4.0, 5.0, 6.0):
        result = await stt.transcribe(
            model="fake", audio=silent_wav(seconds), content_type="audio/wav", language="en"
        )
        heard.add(result.text)
    assert len(heard) > 1


async def test_a_script_is_answered_in_order_then_falls_back() -> None:
    stt = FakeSpeechToText(["first answer", "second answer"])
    assert (
        await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")
    ).text == "first answer"
    assert (
        await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")
    ).text == "second answer"
    third = await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")
    assert third.text not in ("first answer", "second answer")


async def test_word_timings_cover_the_audio_and_are_in_order() -> None:
    """M6's delivery metrics read these offsets, so a fake with no timings would make pace
    untestable and a fake with overlapping ones would make it untestably wrong."""
    stt = FakeSpeechToText(["we queue the write and retry it"])
    result = await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")

    assert [word.text for word in result.words] == result.text.split()
    assert result.words[0].start_ms == 0
    assert all(
        word.end_ms > word.start_ms and word.start_ms >= previous.end_ms - 1
        for previous, word in zip(result.words, result.words[1:], strict=False)
    )
    # Within a word of the clip's length: the last word ends where the audio does.
    assert result.words[-1].end_ms <= int(result.audio_seconds * 1_000) + 1_000


async def test_the_recogniser_reports_the_length_it_would_be_billed_for() -> None:
    stt = FakeSpeechToText()
    result = await stt.transcribe(
        model="fake", audio=silent_wav(7.5), content_type="audio/wav", language="en"
    )
    assert result.audio_seconds == pytest.approx(7.5, abs=0.01)


async def test_the_scripted_recogniser_records_what_it_was_given() -> None:
    stt = ScriptedSpeechToText(["heard it"])
    await stt.transcribe(
        model="nova",
        audio=CLIP,
        content_type="audio/wav",
        language="en",
        keyterms=["Kubernetes", "idempotent"],
    )
    assert stt.calls[0]["keyterms"] == ["Kubernetes", "idempotent"]
    assert stt.calls[0]["model"] == "nova"


async def test_a_scripted_failure_is_raised() -> None:
    stt = ScriptedSpeechToText([FakeSttError("timeout")])
    with pytest.raises(FakeSttError):
        await stt.transcribe(model="fake", audio=CLIP, content_type="audio/wav", language="en")

    tts = ScriptedTextToSpeech([FakeTtsError()])
    with pytest.raises(FakeTtsError):
        await tts.synthesize(model="fake", voice="fake", text="hello")


async def test_synthesis_returns_a_wav_a_player_could_open() -> None:
    speech = await FakeTextToSpeech().synthesize(
        model="fake", voice="fake", text="Thanks. Now, how would you test that?"
    )

    assert speech.content_type == "audio/wav"
    with wave.open(io.BytesIO(speech.audio), "rb") as handle:
        assert handle.getnchannels() == 1
        assert handle.getnframes() > 0


async def test_synthesis_is_billed_on_the_characters_sent() -> None:
    text = "Okay, thank you."
    speech = await FakeTextToSpeech().synthesize(model="fake", voice="fake", text=text)
    assert speech.characters == len(text)
    # And it lasts about as long as the words would take to say, so a metering test means something.
    assert 0.5 < (speech.audio_seconds or 0) < 5


def test_audio_length_is_read_from_a_wav_header_and_estimated_otherwise() -> None:
    assert audio_seconds(silent_wav(2.0), "audio/wav") == pytest.approx(2.0, abs=0.01)
    # Not a WAV: the estimate, and no exception.
    assert audio_seconds(b"\x00" * 32_000, "audio/ogg") == pytest.approx(1.0, abs=0.01)
    # Claims to be a WAV and is not. A benchmark clip with a truncated header must not crash a run.
    assert audio_seconds(b"RIFFnope", "audio/wav") >= 0

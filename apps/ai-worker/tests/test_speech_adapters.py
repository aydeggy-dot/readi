"""The four HTTP adapters, driven through mock transports: no key, no network, no cost.

What is worth testing here is not "does it parse JSON" but the handful of things that cost money or
break a promise if they drift: the opt-out parameter, the EU host, the two different timing units,
the model that must be sent or the bill doubles, and the vendor that cannot be given bytes at all.
"""

import json
from collections.abc import Callable

import httpx2
import pytest

from readi_worker.speech.assemblyai import AssemblyAiSpeechToText
from readi_worker.speech.base import SpeechToText, SttError, TextToSpeech, TtsError
from readi_worker.speech.deepgram import DeepgramSpeechToText
from readi_worker.speech.elevenlabs import ElevenLabsTextToSpeech
from readi_worker.speech.fake import silent_wav
from readi_worker.speech.intron import IntronSpeechToText

CLIP = silent_wav(2.0)
KEY = "k" * 20

DEEPGRAM_BODY = {
    "metadata": {"duration": 2.5},
    "results": {
        "channels": [
            {
                "alternatives": [
                    {
                        "transcript": "we queue the write and retry it",
                        "confidence": 0.97,
                        # **Seconds**, as Deepgram reports them.
                        "words": [
                            {"word": "we", "start": 0.08, "end": 0.24, "confidence": 0.99},
                            {"word": "queue", "start": 0.24, "end": 0.61, "confidence": 0.95},
                        ],
                    }
                ]
            }
        ]
    },
}

ASSEMBLYAI_DONE = {
    "status": "completed",
    "text": "we queue the write and retry it",
    "audio_duration": 2.5,
    "confidence": 0.96,
    # **Milliseconds**, as AssemblyAI reports them.
    "words": [
        {"text": "we", "start": 80, "end": 240, "confidence": 0.99},
        {"text": "queue", "start": 240, "end": 610, "confidence": 0.95},
    ],
}


def recorder(
    handler: Callable[[httpx2.Request], httpx2.Response],
) -> tuple[httpx2.MockTransport, list[httpx2.Request]]:
    """A mock transport that records every request it was given."""
    seen: list[httpx2.Request] = []

    def _handle(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return handler(request)

    return httpx2.MockTransport(_handle), seen


# ---- Deepgram.


async def test_deepgram_never_omits_the_training_opt_out() -> None:
    """Their model training is opt-out and their pages do not say whether a self-serve account is
    enrolled by default, so there must be no path through the adapter that leaves it off."""
    transport, seen = recorder(lambda _r: httpx2.Response(200, json=DEEPGRAM_BODY))
    stt = DeepgramSpeechToText(KEY, timeout_s=5, transport=transport)

    await stt.transcribe(model="nova-3", audio=CLIP, content_type="audio/wav", language="en")

    assert seen[0].url.params["mip_opt_out"] == "true"
    assert seen[0].headers["authorization"] == f"Token {KEY}"


async def test_deepgram_converts_seconds_to_milliseconds() -> None:
    """The conversion nothing downstream should have to remember."""
    transport, _ = recorder(lambda _r: httpx2.Response(200, json=DEEPGRAM_BODY))
    stt = DeepgramSpeechToText(KEY, timeout_s=5, transport=transport)

    result = await stt.transcribe(
        model="nova-3", audio=CLIP, content_type="audio/wav", language="en"
    )

    assert result.text == "we queue the write and retry it"
    assert (result.words[0].start_ms, result.words[0].end_ms) == (80, 240)
    assert (result.words[1].start_ms, result.words[1].end_ms) == (240, 610)
    assert result.audio_seconds == 2.5


async def test_deepgram_sends_one_keyterm_parameter_per_term() -> None:
    """Repeated parameters are how they take more than one, and the cap is theirs to enforce."""
    transport, seen = recorder(lambda _r: httpx2.Response(200, json=DEEPGRAM_BODY))
    stt = DeepgramSpeechToText(KEY, timeout_s=5, transport=transport)

    await stt.transcribe(
        model="nova-3",
        audio=CLIP,
        content_type="audio/wav",
        language="en",
        keyterms=["Kubernetes", "idempotent"],
    )

    assert seen[0].url.params.get_list("keyterm") == ["Kubernetes", "idempotent"]


async def test_deepgram_retries_a_server_error_then_gives_up_by_name() -> None:
    calls = {"n": 0}

    def handler(_request: httpx2.Request) -> httpx2.Response:
        calls["n"] += 1
        return httpx2.Response(503)

    transport, _ = recorder(handler)
    stt = DeepgramSpeechToText(KEY, timeout_s=5, transport=transport)

    with pytest.raises(SttError) as info:
        await stt.transcribe(model="nova-3", audio=CLIP, content_type="audio/wav", language="en")

    assert calls["n"] == 3
    assert info.value.code == "HTTP 503"
    assert info.value.provider == "deepgram"


async def test_a_shape_we_do_not_recognise_is_an_error_not_an_empty_transcript() -> None:
    """An empty transcript would be scored as a total recognition failure and reported as a
    result."""
    transport, _ = recorder(lambda _r: httpx2.Response(200, json={"results": {}}))
    stt = DeepgramSpeechToText(KEY, timeout_s=5, transport=transport)

    with pytest.raises(SttError, match="unreadable response"):
        await stt.transcribe(model="nova-3", audio=CLIP, content_type="audio/wav", language="en")


# ---- AssemblyAI.


async def test_assemblyai_talks_only_to_the_eu_host() -> None:
    """The EU region is the privacy mechanism — the one configuration in which they say they do not
    train on submitted files — so it is not an argument a caller can override."""

    def handler(request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/v2/upload":
            return httpx2.Response(200, json={"upload_url": "https://eu/audio/1"})
        if request.method == "POST":
            return httpx2.Response(200, json={"id": "job-1"})
        return httpx2.Response(200, json=ASSEMBLYAI_DONE)

    transport, seen = recorder(handler)
    stt = AssemblyAiSpeechToText(KEY, timeout_s=5, transport=transport, poll_interval_s=0)

    await stt.transcribe(
        model="universal-3-5-pro", audio=CLIP, content_type="audio/wav", language="en"
    )

    assert {request.url.host for request in seen} == {"api.eu.assemblyai.com"}
    # And their header takes the key bare, with no `Bearer` prefix.
    assert seen[0].headers["authorization"] == KEY


async def test_assemblyai_uploads_then_submits_then_polls() -> None:
    statuses = ["queued", "processing", "completed"]

    def handler(request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/v2/upload":
            return httpx2.Response(200, json={"upload_url": "https://eu/audio/1"})
        if request.method == "POST":
            body = json.loads(request.content)
            assert body["audio_url"] == "https://eu/audio/1"
            assert body["keyterms_prompt"] == ["Kubernetes"]
            return httpx2.Response(200, json={"id": "job-1"})
        status = statuses.pop(0)
        if status != "completed":
            return httpx2.Response(200, json={"status": status})
        return httpx2.Response(200, json=ASSEMBLYAI_DONE)

    transport, seen = recorder(handler)
    stt = AssemblyAiSpeechToText(KEY, timeout_s=5, transport=transport, poll_interval_s=0)

    result = await stt.transcribe(
        model="universal-3-5-pro",
        audio=CLIP,
        content_type="audio/wav",
        language="en",
        keyterms=["Kubernetes"],
    )

    assert [r.url.path for r in seen] == [
        "/v2/upload",
        "/v2/transcript",
        "/v2/transcript/job-1",
        "/v2/transcript/job-1",
        "/v2/transcript/job-1",
    ]
    # Milliseconds arrive as milliseconds: no conversion, which is why the unit is recorded per
    # vendor.
    assert (result.words[0].start_ms, result.words[1].end_ms) == (80, 610)
    assert result.text == "we queue the write and retry it"


async def test_assemblyai_reports_a_failed_job_rather_than_waiting_for_ever() -> None:
    def handler(request: httpx2.Request) -> httpx2.Response:
        if request.url.path == "/v2/upload":
            return httpx2.Response(200, json={"upload_url": "https://eu/audio/1"})
        if request.method == "POST":
            return httpx2.Response(200, json={"id": "job-1"})
        return httpx2.Response(200, json={"status": "error", "error": "audio too short"})

    transport, _ = recorder(handler)
    stt = AssemblyAiSpeechToText(KEY, timeout_s=5, transport=transport, poll_interval_s=0)

    with pytest.raises(SttError, match="transcript error"):
        await stt.transcribe(
            model="universal-3-5-pro", audio=CLIP, content_type="audio/wav", language="en"
        )


# ---- Intron.


async def test_intron_refuses_bytes_by_name() -> None:
    """Their endpoint takes a readable URL, so a benchmark run has to serve its clips from
    somewhere.
    Refusing with a name beats failing obscurely three layers down."""
    transport, seen = recorder(lambda _r: httpx2.Response(200, json={}))
    stt = IntronSpeechToText(KEY, timeout_s=5, transport=transport)

    with pytest.raises(SttError) as info:
        await stt.transcribe(model="en", audio=CLIP, content_type="audio/wav", language="en")

    assert info.value.code == "audio_url_required"
    assert seen == []  # nothing was sent


async def test_intron_always_turns_off_the_language_model_rewrite() -> None:
    """Their transcripts are post-corrected by default. In a benchmark that is scoring a language
    model's repair of a recogniser; in a report that quotes the candidate it is a hallucination."""
    body = {
        "data": {
            "audio_transcript": "we queue the write",
            "processed_audio_duration_in_seconds": 2,
        }
    }
    transport, seen = recorder(lambda _r: httpx2.Response(200, json=body))
    stt = IntronSpeechToText(KEY, timeout_s=5, transport=transport)

    result = await stt.transcribe(
        model="en",
        audio=b"",
        content_type="audio/wav",
        language="en",
        audio_url="https://example.test/clips/s1-part-a.wav",
        keyterms=["Kubernetes"],
    )

    sent = json.loads(seen[0].content)
    assert sent["use_disable_llm_corrections"] == "true"
    assert sent["audio_file_blob"] == "https://example.test/clips/s1-part-a.wav"
    assert sent["use_language_asr_input"] == "en"
    # No custom vocabulary is documented, so nothing pretends otherwise.
    assert "keyterms" not in sent
    assert "keyterm" not in sent
    # And no word timings are invented from a response that has none.
    assert result.words == []
    assert result.text == "we queue the write"


# ---- ElevenLabs.


async def test_elevenlabs_always_names_the_model_because_the_default_costs_double() -> None:
    """Their default is `eleven_multilingual_v2` at $0.08/1k characters against Flash's $0.04."""
    transport, seen = recorder(lambda _r: httpx2.Response(200, content=b"RIFFfake"))
    tts = ElevenLabsTextToSpeech(KEY, timeout_s=5, transport=transport)

    speech = await tts.synthesize(
        model="eleven_flash_v2_5", voice="voice-1", text="Okay, thank you."
    )

    sent = json.loads(seen[0].content)
    assert sent["model_id"] == "eleven_flash_v2_5"
    assert seen[0].url.path == "/v1/text-to-speech/voice-1"
    assert seen[0].url.params["output_format"] == "wav_22050"
    assert seen[0].headers["xi-api-key"] == KEY
    assert speech.content_type == "audio/wav"


async def test_synthesis_is_billed_on_the_characters_sent_not_the_audio_returned() -> None:
    transport, _ = recorder(lambda _r: httpx2.Response(200, content=b"x" * 40_000))
    tts = ElevenLabsTextToSpeech(KEY, timeout_s=5, transport=transport)

    text = "Right. And how would you test that?"
    speech = await tts.synthesize(model="eleven_flash_v2_5", voice="voice-1", text=text)

    assert speech.characters == len(text)


async def test_an_empty_body_is_an_error_not_a_silent_clip() -> None:
    """A zero-length file would be cached as the interviewer's acknowledgement and played as
    silence."""
    transport, _ = recorder(lambda _r: httpx2.Response(200, content=b""))
    tts = ElevenLabsTextToSpeech(KEY, timeout_s=5, transport=transport)

    with pytest.raises(TtsError, match="empty audio"):
        await tts.synthesize(model="eleven_flash_v2_5", voice="voice-1", text="Okay.")


# ---- The Protocols, checked structurally where mypy can see them.

_stt: list[SpeechToText] = [
    DeepgramSpeechToText(KEY, timeout_s=1),
    AssemblyAiSpeechToText(KEY, timeout_s=1),
    IntronSpeechToText(KEY, timeout_s=1),
]
_tts: list[TextToSpeech] = [ElevenLabsTextToSpeech(KEY, timeout_s=1)]

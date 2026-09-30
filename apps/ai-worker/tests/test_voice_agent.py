"""The LiveKit glue, minus LiveKit: the parts of `voice/agent.py` that a room is not needed for.

What is worth testing here is the mapping, not the framework: the dispatch carrying only a session
id, word timings coming off the recognition stream, and one spoken turn's playback facts being
attributed to the right utterance — which is a queue, and a queue is exactly the sort of thing that
looks obviously right and is off by one.
"""

from typing import Any

import pytest
from livekit.agents import stt
from livekit.agents.language import LanguageCode
from livekit.agents.types import TimedString
from livekit.agents.voice import io

from readi_worker.settings import Settings, SettingsError, load_settings
from readi_worker.voice.agent import (
    NO_MODEL_INSTRUCTIONS,
    RoomSpeaker,
    _RoomUtterance,
    _session_id_of,
    _words_of,
)
from readi_worker.voice.transport import Clip
from tests.conftest import SERVICE_TOKEN


class FakeHandle:
    """A speech handle, as much of one as `_RoomUtterance` reads."""

    def __init__(self, *, interrupted: bool = False, ttfb: float | None = None) -> None:
        self.interrupted = interrupted
        self.chat_items = [
            type("Item", (), {"metrics": {"tts_node_ttfb": ttfb} if ttfb is not None else {}})()
        ]
        self._callbacks: list[Any] = []

    def add_done_callback(self, callback: Any) -> None:
        self._callbacks.append(callback)

    def finish(self) -> None:
        for callback in self._callbacks:
            callback(self)


class FakeAudioOutput:
    def __init__(self) -> None:
        self.handlers: dict[str, Any] = {}

    def on(self, event: str, handler: Any) -> None:
        self.handlers[event] = handler

    def finished(
        self, position: float, *, interrupted: bool, transcript: str | None = None
    ) -> None:
        self.handlers["playback_finished"](
            io.PlaybackFinishedEvent(
                playback_position=position,
                interrupted=interrupted,
                synchronized_transcript=transcript,
            )
        )

    def started(self) -> None:
        self.handlers["playback_started"](io.PlaybackStartedEvent(created_at=0.0))


class FakeSession:
    """Enough `AgentSession` for `RoomSpeaker`: it says things and it has an audio output."""

    def __init__(self) -> None:
        self.audio = FakeAudioOutput()
        self.output = type("Output", (), {"audio": self.audio})()
        self.said: list[tuple[str, bool]] = []
        self.handles: list[FakeHandle] = []

    def say(self, text: str, *, audio: Any = None, allow_interruptions: bool = True) -> FakeHandle:
        handle = FakeHandle()
        self.said.append((text, audio is not None))
        self.handles.append(handle)
        return handle


# ---- The dispatch.


def context(metadata: str) -> Any:
    return type("Ctx", (), {"job": type("Job", (), {"metadata": metadata})()})()


def test_the_dispatch_carries_the_session_id_and_nothing_else() -> None:
    assert _session_id_of(context('{"session_id": "abc-123"}')) == "abc-123"


@pytest.mark.parametrize("metadata", ["", "not json", "{}", '{"session_id": 7}', "[]"])
def test_a_dispatch_without_one_is_refused(metadata: str) -> None:
    # The answer key is pulled over the service-token channel (ADR-0019 §4), so a dispatch that
    # says nothing is a bug in the API and not something to guess about.
    with pytest.raises(RuntimeError, match="session_id"):
        _session_id_of(context(metadata))


def test_the_agent_says_out_loud_that_it_has_no_model() -> None:
    # It is the one thing a reader of a LiveKit trace would otherwise wonder about.
    assert "no language model" in NO_MODEL_INSTRUCTIONS


# ---- Word timings.


def test_word_timings_are_taken_off_the_recognition_stream() -> None:
    data = stt.SpeechData(
        language=LanguageCode("en"),
        text="we queue it",
        words=[
            TimedString("we", start_time=0.0, end_time=0.2),
            TimedString("queue", start_time=0.2, end_time=0.55),
        ],
    )
    words = _words_of(data)
    assert [(word.text, word.start_ms, word.end_ms) for word in words] == [
        ("we", 0, 200),
        ("queue", 200, 550),
    ]


def test_a_provider_that_reports_no_timings_reports_none() -> None:
    assert _words_of(stt.SpeechData(language=LanguageCode("en"), text="we queue it")) == []


def test_a_word_with_no_offsets_is_dropped_rather_than_invented() -> None:
    data = stt.SpeechData(
        language=LanguageCode("en"),
        text="we queue",
        words=[TimedString("we"), TimedString("queue", start_time=0.2, end_time=0.4)],
    )
    assert [word.text for word in _words_of(data)] == ["queue"]


# ---- One spoken turn's playback facts.


async def test_playback_facts_land_on_the_utterance_that_was_speaking() -> None:
    session = FakeSession()
    speaker = RoomSpeaker(session)  # type: ignore[arg-type]  # as much session as it reads
    speaker.attach()

    first = speaker.say("Okay.", clip=Clip(audio=b"", content_type="audio/wav", seconds=0.4))
    second = speaker.say("How did you decide what to test first?")

    session.audio.started()
    assert await first.started() is True
    session.audio.finished(0.4, interrupted=False)
    settled = await first.settled()
    assert settled.spoken_ms == 400
    assert settled.interrupted is False
    assert settled.total_ms == 400  # from the clip, which is how an interruption is placed

    session.audio.started()
    session.audio.finished(0.9, interrupted=True, transcript="How did you")
    second_settled = await second.settled()
    assert second_settled.spoken_ms == 900
    assert second_settled.interrupted is True
    assert second_settled.heard_text == "How did you"
    assert second_settled.total_ms is None  # synthesized: the spoken prefix is what decides


async def test_pinned_audio_bypasses_the_synthesizer() -> None:
    session = FakeSession()
    speaker = RoomSpeaker(session)  # type: ignore[arg-type]
    speaker.attach()
    speaker.say("Okay.", clip=Clip(audio=b"", content_type="audio/wav", seconds=0.4))
    speaker.say("A question.")
    assert session.said == [("Okay.", True), ("A question.", False)]


async def test_an_utterance_that_never_reached_the_output_still_settles() -> None:
    # Otherwise the exchange waits for an event that is never coming, with a candidate on the line.
    handle = FakeHandle(interrupted=True)
    utterance = _RoomUtterance(handle, None)
    handle.finish()
    assert await utterance.started() is False
    settled = await utterance.settled()
    assert settled.spoken_ms == 0
    assert settled.interrupted is True


async def test_the_synthesizer_s_first_byte_comes_from_livekit_s_own_metrics() -> None:
    assert _RoomUtterance(FakeHandle(ttfb=0.085), None).synthesis_ttfb_ms == 85
    # Nothing was synthesized for a pinned clip, which is what a null means on the sample.
    assert _RoomUtterance(FakeHandle(), None).synthesis_ttfb_ms is None


# ---- Configuration.


def base_env() -> dict[str, str]:
    return {
        "ENVIRONMENT": "test",
        "REDIS_URL": "redis://127.0.0.1:16379/0",
        "SERVICE_TOKEN": SERVICE_TOKEN,
        "LLM_PROVIDER": "fake",
    }


def test_a_voice_deployment_needs_a_room_to_serve_it_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for name, value in {**base_env(), "VOICE_ENABLED": "true"}.items():
        monkeypatch.setenv(name, value)
    with pytest.raises(SettingsError) as raised:
        load_settings(env_file=None)
    assert "LIVEKIT_URL" in str(raised.value)
    assert "LIVEKIT_API_KEY" in str(raised.value)


def test_a_text_only_deployment_needs_no_livekit(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in base_env().items():
        monkeypatch.setenv(name, value)
    settings = load_settings(env_file=None)
    assert settings.voice_enabled is False
    assert settings.livekit_url is None


def test_the_voice_turn_deadline_is_shorter_than_the_text_one() -> None:
    # 45 s is a text-mode number: by then a candidate in a conversation has said "hello?" twice.
    settings = Settings.model_construct()
    assert Settings.model_fields["voice_llm_timeout_s"].default < 45.0
    assert settings is not None

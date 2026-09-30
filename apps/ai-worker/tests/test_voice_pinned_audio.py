"""The interviewer's own words, rendered once — and what happens when they cannot be."""

from readi_worker.speech.fake import (
    FakeTextToSpeech,
    FakeTtsError,
    ScriptedTextToSpeech,
    silent_wav,
)
from readi_worker.voice.acknowledgements import TAKE_YOUR_TIME, pinned_lines
from readi_worker.voice.pinned_audio import PinnedAudio


def build(tts: object | None = None) -> PinnedAudio:
    return PinnedAudio(
        tts or FakeTextToSpeech(),  # type: ignore[arg-type]  # a Protocol, satisfied structurally
        model="fake",
        voice="fake",
    )


async def test_warming_renders_every_pinned_line() -> None:
    pinned = build()
    await pinned.warm()
    for line in pinned_lines():
        assert pinned.has(line), line
        clip = pinned.get(line)
        assert clip is not None
        assert clip.audio
        assert clip.seconds is not None


async def test_the_key_is_the_exact_words() -> None:
    # Two texts that differ by a comma are two different things to say, and serving one as the
    # other would put words in the interviewer's mouth.
    pinned = build()
    await pinned.render("Okay.")
    assert pinned.get("Okay.") is not None
    assert pinned.get("Okay") is None
    assert pinned.get("okay.") is None
    # Surrounding whitespace is forgiven: a rendered line and a spoken turn may differ by it.
    assert pinned.get("  Okay. ") is not None


async def test_rendering_twice_costs_one_call() -> None:
    scripted = ScriptedTextToSpeech([silent_wav(0.5)])
    pinned = build(scripted)
    first = await pinned.render(TAKE_YOUR_TIME)
    second = await pinned.render(TAKE_YOUR_TIME)
    assert first is not None
    assert second is not None
    assert first.audio == second.audio
    assert len(scripted.calls) == 1


async def test_every_render_is_a_cost_record() -> None:
    pinned = build()
    await pinned.render("Okay.")
    await pinned.render("Thanks.")
    calls = pinned.drain_calls()
    assert [call.purpose for call in calls] == ["tts", "tts"]
    assert [call.unit_kind for call in calls] == ["characters", "characters"]
    assert calls[0].input_units == len("Okay.")
    # Drained once: the records ride home with one exchange and not with every exchange after it.
    assert pinned.drain_calls() == []


async def test_a_synthesizer_that_refuses_costs_the_cache_and_not_the_interview() -> None:
    pinned = build(ScriptedTextToSpeech([FakeTtsError("Unavailable")]))
    assert await pinned.render("Okay.") is None
    assert pinned.get("Okay.") is None
    calls = pinned.drain_calls()
    assert len(calls) == 1
    assert calls[0].status == "error"
    assert calls[0].error_code is not None
    assert calls[0].error_code.root == "Unavailable"
    assert calls[0].cost_micro_usd == 0


async def test_warming_survives_a_failure_part_way_through() -> None:
    # A leg whose synthesizer is down speaks every line the ordinary way; nothing raises.
    steps: list[object] = [FakeTtsError() for _ in pinned_lines()]
    pinned = build(ScriptedTextToSpeech(steps))  # type: ignore[arg-type]  # scripted steps
    await pinned.warm()
    assert all(pinned.get(line) is None for line in pinned_lines())


async def test_an_empty_line_is_not_rendered() -> None:
    scripted = ScriptedTextToSpeech([])
    pinned = build(scripted)
    assert await pinned.render("   ") is None
    assert scripted.calls == []

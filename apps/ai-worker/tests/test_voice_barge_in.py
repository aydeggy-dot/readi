"""The barge-in rule: a probe counts as asked only if the candidate heard its ask.

The probes here are the shapes the real banks have (`tests/interview_fixtures.py`), because the rule
turns on where the ask falls in one spoken sentence and an invented probe would put it somewhere
convenient.
"""

from readi_worker.contracts import InterviewTurn
from readi_worker.speech.base import TranscriptWord as SpeechWord
from readi_worker.voice.barge_in import (
    HEARD_TAIL_TOLERANCE_CHARACTERS,
    MAX_WORDS_PER_TURN,
    Playback,
    ask_end_offset,
    heard_the_ask,
    heard_turn,
    spoken_turn,
)

PROBE = "How did you decide what to test first?"
TWO_SENTENCES = "That is the part I want to understand. What would you change about it?"


def interviewer(text: str, *, probe: int | None = 0) -> InterviewTurn:
    return InterviewTurn.model_validate(
        {
            "seq": 3,
            "speaker": "interviewer",
            "state": "follow_up",
            "question_position": 1,
            "follow_up_index": probe,
            "text": text,
            "criteria_covered": None,
        }
    )


def candidate(text: str = "we queue the write and retry it") -> InterviewTurn:
    return InterviewTurn.model_validate(
        {
            "seq": 4,
            "speaker": "candidate",
            "state": "follow_up",
            "question_position": 1,
            "follow_up_index": None,
            "text": text,
            "criteria_covered": None,
        }
    )


# ---- Where the ask is.


def test_the_ask_ends_at_the_end_of_its_sentence() -> None:
    assert ask_end_offset(PROBE) == len(PROBE)


def test_a_preamble_does_not_count_as_the_ask() -> None:
    # The first sentence asks nothing, so the offset is the end of the second.
    offset = ask_end_offset(TWO_SENTENCES)
    assert offset == len(TWO_SENTENCES)
    assert "change" in TWO_SENTENCES[:offset]


def test_the_ask_can_be_the_first_of_two_sentences() -> None:
    text = "What would you change about it? I am curious about the ordering."
    offset = ask_end_offset(text)
    assert text[:offset] == "What would you change about it?"


def test_a_text_that_asks_nothing_has_to_be_heard_whole() -> None:
    text = "That is everything from me. Thank you for your time today."
    assert ask_end_offset(text) == len(text)


def test_an_empty_text_has_no_ask() -> None:
    assert ask_end_offset("   ") == 0


# ---- Whether it was heard.


def test_a_turn_that_finished_was_heard() -> None:
    assert heard_the_ask(PROBE, Playback(spoken_ms=4_000, interrupted=False))


def test_the_spoken_prefix_is_preferred_over_the_audio_fraction() -> None:
    # Cut off before the ask: the prefix is what decides, and it says the ask never arrived.
    early = Playback(
        spoken_ms=3_900, interrupted=True, total_ms=4_000, heard_text="How did you decide"
    )
    assert not heard_the_ask(PROBE, early)
    whole = Playback(spoken_ms=100, interrupted=True, total_ms=4_000, heard_text=PROBE)
    assert heard_the_ask(PROBE, whole)


def test_the_audio_fraction_is_used_when_there_is_no_prefix() -> None:
    assert heard_the_ask(PROBE, Playback(spoken_ms=3_950, interrupted=True, total_ms=4_000))
    assert not heard_the_ask(PROBE, Playback(spoken_ms=1_200, interrupted=True, total_ms=4_000))


def test_an_ask_in_the_first_sentence_can_be_heard_before_the_turn_ends() -> None:
    text = "What would you change about it? I am curious about the ordering of the two."
    half = Playback(spoken_ms=2_000, interrupted=True, total_ms=4_000)
    assert heard_the_ask(text, half)


def test_a_clipped_last_word_still_counts_as_asked() -> None:
    # A candidate who starts answering as the question finishes has heard the question.
    at_the_end = Playback(spoken_ms=4_000, interrupted=True, total_ms=4_000)
    assert heard_the_ask(PROBE, at_the_end)
    # 250 ms of a four-second question: "…what to test firs—".
    clipped = Playback(spoken_ms=3_750, interrupted=True, total_ms=4_000)
    assert heard_the_ask(PROBE, clipped)


def test_cut_off_further_back_than_a_syllable_is_not_asked() -> None:
    # A whole word short of the end, which is where the tolerance stops: "…what to —".
    assert HEARD_TAIL_TOLERANCE_CHARACTERS < 6
    assert not heard_the_ask(PROBE, Playback(spoken_ms=3_300, interrupted=True, total_ms=4_000))


def test_an_interruption_nobody_can_place_is_not_heard() -> None:
    assert not heard_the_ask(PROBE, Playback(spoken_ms=3_000, interrupted=True, total_ms=None))
    assert not heard_the_ask(PROBE, Playback(spoken_ms=3_000, interrupted=True, total_ms=0))


# ---- What that does to the turn.


def test_a_probe_the_candidate_talked_over_is_not_recorded_as_asked() -> None:
    turn = spoken_turn(
        interviewer(PROBE),
        Playback(spoken_ms=600, interrupted=True, total_ms=4_000, heard_text="How did you"),
    )
    assert turn.follow_up_index is None
    assert turn.voice is not None
    assert turn.voice.interrupted is True
    assert turn.voice.spoken_ms is not None
    assert turn.voice.spoken_ms.root == 600
    # The words are still what the engine said, so the report and the evaluator read the question.
    assert turn.text == PROBE


def test_a_probe_that_was_heard_keeps_its_index() -> None:
    turn = spoken_turn(interviewer(PROBE), Playback(spoken_ms=4_000, interrupted=False))
    assert turn.follow_up_index is not None
    assert turn.follow_up_index.root == 0
    assert turn.voice is not None
    assert turn.voice.interrupted is False


def test_a_turn_with_no_probe_is_untouched_by_the_rule() -> None:
    turn = spoken_turn(
        interviewer("Let's move on. Question 2: tell me about a system.", probe=None),
        Playback(spoken_ms=100, interrupted=True, total_ms=4_000),
    )
    assert turn.follow_up_index is None
    assert turn.voice is not None
    assert turn.voice.interrupted is True


def test_a_turn_whose_audio_never_started_was_not_heard() -> None:
    turn = spoken_turn(interviewer(PROBE), None)
    assert turn.follow_up_index is None
    assert turn.voice is not None
    assert turn.voice.spoken_ms is not None
    assert turn.voice.spoken_ms.root == 0
    assert turn.voice.interrupted is True


# ---- The candidate's side.


def test_word_timings_ride_on_the_candidate_turn() -> None:
    words = [
        SpeechWord(text="we", start_ms=0, end_ms=200, confidence=0.9),
        SpeechWord(text="queue", start_ms=200, end_ms=500, confidence=None),
    ]
    turn = heard_turn(candidate(), words, 0.87)
    assert turn.voice is not None
    assert [word.text for word in turn.voice.words] == ["we", "queue"]
    assert turn.voice.stt_confidence is not None
    assert turn.voice.stt_confidence.root == 0.87
    assert turn.voice.spoken_ms is None
    assert turn.voice.interrupted is False


def test_a_provider_over_one_does_not_cost_the_exchange() -> None:
    turn = heard_turn(
        candidate(), [SpeechWord(text="hi", start_ms=0, end_ms=1, confidence=1.4)], 2.0
    )
    assert turn.voice is not None
    assert turn.voice.words[0].confidence is not None
    assert turn.voice.words[0].confidence.root == 1.0
    assert turn.voice.stt_confidence is not None
    assert turn.voice.stt_confidence.root == 1.0


def test_a_degenerate_timing_loses_one_word_and_not_the_turn() -> None:
    # `TranscriptWord` deliberately does not check that `end_ms` follows `start_ms` (phase 0).
    turn = heard_turn(candidate(), [SpeechWord(text="x", start_ms=500, end_ms=100)], None)
    assert turn.voice is not None
    assert turn.voice.words[0].start_ms == 500


def test_too_many_words_are_capped_rather_than_refused() -> None:
    many = [
        SpeechWord(text="and", start_ms=index, end_ms=index + 1)
        for index in range(MAX_WORDS_PER_TURN + 50)
    ]
    turn = heard_turn(candidate(), many, None)
    assert turn.voice is not None
    assert len(turn.voice.words) == MAX_WORDS_PER_TURN

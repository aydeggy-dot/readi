"""The interviewer's immediate words: rotated, short, and never praise.

The no-praise test is the one the owner asked for by name (decision 3 of 2026-09-29), and the word
list lives **here** rather than in the module it checks: a list the implementation owns could be
narrowed in the same commit that widened the set, and then it would pass by agreeing with itself.
"""

import re

from readi_worker.voice.acknowledgements import (
    ACKNOWLEDGEMENTS,
    CANNOT_ANSWER,
    TAKE_YOUR_TIME,
    acknowledgement,
    pinned_lines,
)

#: Mirrors `VOICE_LIMITS.acknowledgementMaxLength` in @readi/shared-types.
ACKNOWLEDGEMENT_MAX_LENGTH = 40

#: Anything that could be heard as "that answer was good". A candidate who has just been wrong must
#: not hear praise their report then contradicts — praise is the evaluator's to give, from a rubric.
#: `right` is in the list and `alright` is not caught by it, which is the whole reason these are
#: whole-word patterns: "Alright." is a discourse marker and "Right." would be agreement.
EVALUATIVE = (
    "good",
    "great",
    "excellent",
    "perfect",
    "nice",
    "well",
    "correct",
    "right",
    "exactly",
    "absolutely",
    "interesting",
    "impressive",
    "strong",
    "solid",
    "clear",
    "brilliant",
    "smart",
    "sharp",
    "love",
    "helpful",
    "useful",
    "sense",
    "fair",
    "lovely",
    "wonderful",
    "amazing",
    "awesome",
    "super",
)


def test_no_acknowledgement_sounds_like_approval() -> None:
    for line in ACKNOWLEDGEMENTS:
        for word in EVALUATIVE:
            assert not re.search(rf"\b{word}\b", line, re.IGNORECASE), f"{line!r} praises: {word}"


def test_alright_is_in_the_set_and_is_not_caught_by_the_word_filter() -> None:
    # The case the filter is written for: `right` is forbidden, `alright` is not `right`.
    assert "Alright." in ACKNOWLEDGEMENTS
    assert not re.search(r"\bright\b", "Alright.", re.IGNORECASE)
    assert re.search(r"\bright\b", "Right.", re.IGNORECASE)
    assert "Right." not in ACKNOWLEDGEMENTS


def test_acknowledgements_are_a_few_words() -> None:
    for line in ACKNOWLEDGEMENTS:
        assert len(line) <= ACKNOWLEDGEMENT_MAX_LENGTH, line
        assert "?" not in line, f"{line!r} asks something"


def test_the_line_varies_within_a_session() -> None:
    session = "11111111-2222-4333-8444-555555555555"
    said = [acknowledgement(session, turn) for turn in range(len(ACKNOWLEDGEMENTS))]
    assert len(set(said)) == len(ACKNOWLEDGEMENTS)


def test_the_line_is_stable_for_the_same_session_and_turn() -> None:
    session = "11111111-2222-4333-8444-555555555555"
    assert acknowledgement(session, 3) == acknowledgement(session, 3)


def test_two_sessions_start_differently() -> None:
    # Not a guarantee for any given pair — it is a rotation, not a hash of the turn — but these two
    # differ, which is what stops every interview opening with the same word.
    first = acknowledgement("11111111-2222-4333-8444-555555555555", 0)
    second = acknowledgement("22222222-3333-4444-8555-666666666666", 0)
    assert first != second


def test_a_negative_turn_still_answers() -> None:
    # Defensive: a seq is never negative, and a crash in the first audio the candidate hears would
    # be the worst possible place for one.
    assert acknowledgement("abc", -1) in ACKNOWLEDGEMENTS


def test_every_pinned_line_is_offered_for_rendering() -> None:
    lines = pinned_lines()
    assert set(ACKNOWLEDGEMENTS) <= set(lines)
    assert TAKE_YOUR_TIME in lines
    assert CANNOT_ANSWER in lines
    assert len(set(lines)) == len(lines)


def test_the_silence_line_neither_asks_nor_praises() -> None:
    assert "?" not in TAKE_YOUR_TIME
    for word in EVALUATIVE:
        assert not re.search(rf"\b{word}\b", TAKE_YOUR_TIME, re.IGNORECASE)

"""What a turn may contain: the model speaks, code decides.

An interviewer asks and then listens. A model that answers its own question, lays out a bulleted
framework, or trails off mid-word is not an interviewer, and none of that is worth a retry when it
can simply be trimmed.
"""

from readi_worker.interview.calls import (
    SPEECH_MAX_LENGTH,
    CoverageJudgement,
    ProbeVerdict,
    normalise_speech,
    normalise_verdicts,
)


def test_markup_and_leaked_tags_are_removed() -> None:
    assert normalise_speech("## Question\n- first\n- second") == "Question first second"
    assert normalise_speech("<answer>Tell me more.</answer>") == "Tell me more."


def test_surrounding_quotes_are_removed() -> None:
    assert normalise_speech('"Tell me about a time you shipped late."') == (
        "Tell me about a time you shipped late."
    )


def test_a_long_turn_is_cut_at_a_sentence_boundary() -> None:
    sentence = "This is a sentence about testing. "
    spoken = normalise_speech(sentence * 60)
    assert len(spoken) <= SPEECH_MAX_LENGTH
    assert spoken.endswith("testing."), "never mid-word, and never mid-sentence"


def test_a_long_turn_with_no_sentence_end_is_cut_at_a_word() -> None:
    spoken = normalise_speech("word " * 500)
    assert len(spoken) <= SPEECH_MAX_LENGTH + 1
    assert spoken.endswith("…")
    assert "wor…" not in spoken


def test_an_empty_utterance_normalises_to_nothing_so_the_caller_retries() -> None:
    assert normalise_speech("   \n  ") == ""
    assert normalise_speech("### ") == ""


# ---- Verdicts.


def judgement(*probes: tuple[int, bool]) -> CoverageJudgement:
    return CoverageJudgement(
        probes=[ProbeVerdict(probe=i, reason="r", already_answered=a) for i, a in probes]
    )


def test_verdicts_come_back_in_the_order_they_were_asked_about() -> None:
    kept = normalise_verdicts(judgement((1, True), (0, False)), probes=(0, 1))
    assert [verdict.probe for verdict in kept] == [0, 1]


def test_a_probe_that_was_not_asked_about_is_dropped() -> None:
    kept = normalise_verdicts(judgement((0, True), (7, True)), probes=(0,))
    assert [verdict.probe for verdict in kept] == [0]


def test_a_repeated_probe_keeps_the_first_verdict() -> None:
    kept = normalise_verdicts(judgement((0, True), (0, False)), probes=(0,))
    assert kept[0].already_answered is True


def test_a_judgement_about_nothing_we_asked_is_empty_and_therefore_retried() -> None:
    assert normalise_verdicts(judgement((5, True)), probes=(0, 1)) == []

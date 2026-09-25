"""The development stand-in recognises every prompt the engine sends it.

`fake_script.py` sniffs the rendered prompt to work out which turn it is being asked for, which is
the one fragile thing in it. This renders each template the way `service.py` does and asserts the
classification, so rewording a prompt fails here — loudly, in CI — rather than turning up as a
wrong-sounding line in somebody's dev session or in the e2e output.
"""

from readi_worker.interview.fake_script import (
    FAKE_CANDIDATE_ANSWER,
    FAKE_INVITE,
    FAKE_WRAP_UP,
    judge,
    speak,
    tag,
)
from readi_worker.prompts import as_data, render

PROMPT = "Tell me about a system you have tested."
PROBE = "How did you decide what to test first?"


def test_a_question_prompt_is_answered_with_the_pinned_question() -> None:
    user = render(
        "interview_question",
        1,
        position=0,
        total=4,
        question_block=as_data(PROMPT, "question"),
        has_context=False,
    )
    assert speak(user).speech == PROMPT


def test_a_follow_up_prompt_is_answered_with_the_probe_not_the_question() -> None:
    user = render(
        "interview_followup",
        1,
        question_block=as_data(PROMPT, "question"),
        answer_block=as_data("I did.", "answer"),
        probe_block=as_data(PROBE, "follow_up"),
    )
    assert speak(user).speech == PROBE, "the follow-up prompt carries both blocks"


def test_the_invitation_and_the_answer_are_told_apart() -> None:
    invite = render("interview_candidate_questions", 1, candidate_question_block="")
    assert speak(invite).speech == FAKE_INVITE
    answering = render(
        "interview_candidate_questions",
        1,
        candidate_question_block=as_data("How big is the team?", "candidate_question"),
    )
    assert speak(answering).speech == FAKE_CANDIDATE_ANSWER


def test_the_close_is_recognised_for_every_reason_a_session_ends() -> None:
    for reason in ("questions_done", "out_of_time", "candidate_ended"):
        assert speak(render("interview_wrapup", 1, end_reason=reason)).speech == FAKE_WRAP_UP


def test_coverage_answers_every_probe_the_prompt_lists() -> None:
    user = render(
        "interview_coverage_input",
        1,
        question_block=as_data(PROMPT, "question"),
        answer_block=as_data("I did some of it. covered:1", "answer"),
        probed_before="",
        probes_block=as_data(f"0. {PROBE}\n1. And the cost?", "follow_ups"),
    )
    judgement = judge(user)
    assert [(v.probe, v.already_answered) for v in judgement.probes] == [(0, False), (1, True)]


def test_a_probe_already_asked_is_shown_to_the_judge_without_being_judged_again() -> None:
    user = render(
        "interview_coverage_input",
        1,
        question_block=as_data(PROMPT, "question"),
        answer_block=as_data("More.", "answer"),
        probed_before=as_data(PROBE, "already_asked"),
        probes_block=as_data("1. And the cost?", "follow_ups"),
    )
    assert tag(user, "already_asked") == PROBE
    assert [v.probe for v in judge(user).probes] == [1]


def test_a_missing_block_reads_as_absent_rather_than_empty() -> None:
    assert tag("nothing here", "answer") is None

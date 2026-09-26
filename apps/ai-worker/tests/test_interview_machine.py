"""The state machine as a transition table: every state, every action, every budget edge.

Nothing here touches a model or a network. That is the point of the split — if a rule about how an
interview runs is not decided in this file, it is decided in the wrong place.
"""

from datetime import datetime

import pytest

from readi_worker.contracts import InterviewSessionBundle
from readi_worker.interview import budgets, machine
from readi_worker.interview.machine import (
    AnswerCandidateQuestion,
    AskFollowUp,
    AskQuestion,
    AwaitCandidate,
    EngineError,
    EngineState,
    Finished,
    InviteCandidateQuestions,
    SpeakIntro,
    SpeakWrapUp,
    Step,
)
from tests.interview_fixtures import TWO_ON_ONE, at, bundle, question


def drive(
    state: EngineState, deck: InterviewSessionBundle, now: datetime
) -> tuple[EngineState, list[Step]]:
    """Run the engine until it is waiting or finished, collecting what it said."""
    steps: list[Step] = []
    while True:
        state, step = machine.plan(state, deck, now)
        if isinstance(step, AwaitCandidate | Finished):
            return state, steps
        steps.append(step)


# ---- Starting.


def test_a_new_session_is_waiting_in_intro() -> None:
    deck = bundle()
    state = machine.begin(deck)
    assert state.state == "intro"
    assert machine.plan(state, deck, at(0))[1] == AwaitCandidate()


def test_start_speaks_the_intro_and_then_asks_the_first_question() -> None:
    deck = bundle()
    state, steps = drive(machine.start(machine.begin(deck)), deck, at(0))
    assert steps == [SpeakIntro(seq=0), AskQuestion(seq=1, question=0)]
    assert state.state == "question"
    assert state.current_question == 0
    assert state.questions_asked == 1
    assert state.at(0).asked is True
    assert machine.plan(state, deck, at(0))[1] == AwaitCandidate()


def test_a_session_can_only_be_started_once() -> None:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    with pytest.raises(EngineError) as raised:
        machine.start(state)
    assert raised.value.code == "bad_request"


def test_a_session_started_after_its_deadline_goes_straight_to_the_close() -> None:
    deck = bundle()
    state, steps = drive(machine.start(machine.begin(deck)), deck, at(20))
    assert steps == [SpeakIntro(seq=0), SpeakWrapUp(seq=1)]
    assert state.state == "ended"
    assert state.end_reason == "out_of_time"


# ---- Answering, and the follow-ups that come of it.


def started() -> tuple[InterviewSessionBundle, EngineState]:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    return deck, state


def test_an_answer_that_covers_nothing_earns_the_first_probe() -> None:
    deck, state = started()
    state, seq = machine.take_answer(state, "I tested it.", covered=())
    assert seq == 2
    state, steps = drive(state, deck, at(1))
    assert steps == [AskFollowUp(seq=3, question=0, probe=0)]
    assert state.state == "follow_up"
    assert state.at(0).probes_asked == (0,)


def test_an_answer_that_covers_everything_moves_on_with_no_follow_up() -> None:
    deck, state = started()
    state, _ = machine.take_answer(state, "All of it.", covered=(0, 1))
    state, steps = drive(state, deck, at(1))
    assert steps == [AskQuestion(seq=3, question=1)]
    assert state.at(0).probes_asked == ()
    assert state.at(0).probes_covered == (0, 1)


def test_the_follow_up_budget_caps_at_two_however_many_probes_there_are() -> None:
    deck = bundle(questions=[question(0, probes=TWO_ON_ONE), question(1)])
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    for _ in range(3):
        state, _ = machine.take_answer(state, "More.", covered=())
        state, _ = drive(state, deck, at(1))
    assert len(state.at(0).probes_asked) == 2
    assert state.state == "question"
    assert state.current_question == 1


def test_a_second_probe_on_one_criterion_waits_for_every_other_criterion() -> None:
    """The plan's rule, on the shape sixteen of the 104 seeded questions really have."""
    deck = bundle(questions=[question(0, probes=TWO_ON_ONE)])
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "One.", covered=())
    state, steps = drive(state, deck, at(1))
    # Probe 0 is criterion 1; probe 1 is the *second* probe of criterion 1; probe 2 is criterion 2.
    assert steps == [AskFollowUp(seq=3, question=0, probe=0)]
    state, _ = machine.take_answer(state, "Two.", covered=())
    state, steps = drive(state, deck, at(2))
    assert steps == [AskFollowUp(seq=5, question=0, probe=2)], "criterion 2 before a second probe"


def test_the_second_probe_is_reached_when_nothing_else_is_open() -> None:
    deck = bundle(questions=[question(0, probes=TWO_ON_ONE)], max_follow_ups=2)
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    # The answer already covers criterion 2's probe, so only criterion 1's two remain.
    state, _ = machine.take_answer(state, "Covered the last one.", covered=(2,))
    state, steps = drive(state, deck, at(1))
    assert steps == [AskFollowUp(seq=3, question=0, probe=0)]
    state, _ = machine.take_answer(state, "Still going.", covered=())
    state, steps = drive(state, deck, at(2))
    assert steps == [AskFollowUp(seq=5, question=0, probe=1)]


def test_a_covered_probe_is_never_asked() -> None:
    deck, state = started()
    state, _ = machine.take_answer(state, "I decided by risk.", covered=(0,))
    _, steps = drive(state, deck, at(1))
    assert steps == [AskFollowUp(seq=3, question=0, probe=1)]


def test_an_answer_needs_the_engine_to_be_waiting_for_one() -> None:
    deck = bundle()
    with pytest.raises(EngineError) as raised:
        machine.take_answer(machine.begin(deck), "hello")
    assert raised.value.code == "bad_request"


# ---- The budgets.


def test_the_question_budget_caps_the_count() -> None:
    deck = bundle(questions=[question(index) for index in range(6)], question_budget=2)
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    for _ in range(2):
        state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
        state, _ = drive(state, deck, at(1))
    assert state.questions_asked == 2
    assert state.state == "candidate_questions"


def test_running_out_of_questions_ends_the_questioning_too() -> None:
    deck = bundle(questions=[question(0)], question_budget=4)
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
    state, _ = drive(state, deck, at(1))
    assert state.state == "candidate_questions"


def test_too_little_time_for_another_question_moves_to_their_questions() -> None:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
    # 100 seconds left: under SECONDS_FOR_A_QUESTION, over SECONDS_FOR_CANDIDATE_QUESTIONS.
    state, steps = drive(state, deck, at(15 - 100 / 60))
    assert steps == [InviteCandidateQuestions(seq=3)]
    assert state.state == "candidate_questions"


def test_too_little_time_for_their_questions_goes_straight_to_the_close() -> None:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
    state, steps = drive(state, deck, at(15 - 30 / 60))  # 30 seconds left
    assert steps == [SpeakWrapUp(seq=3)]
    assert state.state == "ended"
    assert state.end_reason == "out_of_time"


def test_the_deadline_outranks_the_question_count() -> None:
    deck = bundle(questions=[question(index) for index in range(8)], question_budget=8)
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
    state, _ = drive(state, deck, at(16))
    assert state.state == "ended"
    assert state.end_reason == "out_of_time"


@pytest.mark.parametrize(
    ("left", "probes_expected"),
    [(budgets.SECONDS_FOR_A_FOLLOW_UP + 5, True), (budgets.SECONDS_FOR_A_FOLLOW_UP - 5, False)],
)
def test_there_is_no_coverage_call_when_there_is_no_room_for_a_follow_up(
    left: int, probes_expected: bool
) -> None:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    judged = machine.probes_to_judge(state, deck, at(15 - left / 60))
    assert bool(judged) is probes_expected


def test_there_is_no_coverage_call_once_the_follow_up_budget_is_spent() -> None:
    """The free saving: with nothing left to ask, the verdict could not change anything."""
    deck, state = started()
    for _ in range(2):
        assert machine.probes_to_judge(state, deck, at(1)) != ()
        state, _ = machine.take_answer(state, "More.", covered=())
        state, _ = drive(state, deck, at(1))
    assert state.at(0).probes_asked == (0, 1)
    assert machine.probes_to_judge(state, deck, at(2)) == ()


def test_there_is_no_coverage_call_when_every_probe_is_already_covered() -> None:
    deck, state = started()
    state, _ = machine.take_answer(state, "Everything.", covered=(0, 1))
    assert machine.probes_to_judge(state, deck, at(1)) == ()


# ---- Their questions, and the close.


def test_their_questions_are_answered_one_after_another() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
    state, steps = drive(state, deck, at(1))
    assert steps == [InviteCandidateQuestions(seq=3)]
    state, _ = machine.take_answer(state, "What is the team like?")
    state, steps = drive(state, deck, at(2))
    assert steps == [AnswerCandidateQuestion(seq=5, text="What is the team like?")]
    assert state.state == "candidate_questions"


def test_skipping_their_questions_closes_the_interview() -> None:
    deck = bundle(questions=[question(0)], question_budget=1)
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = machine.take_answer(state, "Answer.", covered=(0, 1))
    state, _ = drive(state, deck, at(1))
    state, steps = drive(machine.skip(state, deck, at(2)), deck, at(2))
    assert steps == [SpeakWrapUp(seq=4)]
    assert state.state == "ended"
    assert state.end_reason == "questions_done"


def test_skipping_a_question_moves_to_the_next_one_and_writes_no_turn() -> None:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, steps = drive(machine.skip(state, deck, at(1)), deck, at(1))
    assert steps == [AskQuestion(seq=2, question=1)], "seq 2, because nothing was said at seq 2"
    assert state.at(0).asked is True
    assert state.at(0).probes_asked == ()


def test_ending_early_closes_the_interview_and_says_so() -> None:
    deck, state = started()
    state, steps = drive(machine.end_early(state), deck, at(3))
    assert steps == [SpeakWrapUp(seq=2)]
    assert state.state == "ended"
    assert state.end_reason == "candidate_ended"


def test_ending_early_outranks_the_budgets() -> None:
    deck = bundle()
    state, _ = drive(machine.start(machine.begin(deck)), deck, at(0))
    state, _ = drive(machine.end_early(state), deck, at(20))
    assert state.end_reason == "candidate_ended"


def test_an_ended_session_does_nothing_more() -> None:
    deck, state = started()
    state, _ = drive(machine.end_early(state), deck, at(3))
    assert machine.plan(state, deck, at(4))[1] == Finished()
    for action in (machine.end_early, lambda s: machine.take_answer(s, "hello")):
        with pytest.raises(EngineError):
            action(state)


# ---- Snapshots.


def test_a_snapshot_round_trips() -> None:
    deck, state = started()
    state, _ = machine.take_answer(state, "Answer.", covered=(1,))
    state, _ = drive(state, deck, at(1))
    restored = machine.from_snapshot(machine.to_snapshot(state), deck)
    assert restored.state == state.state
    assert restored.next_seq == state.next_seq
    assert restored.progress == state.progress
    assert restored.awaiting is True, "a stored session is always waiting for the candidate"


def test_a_snapshot_for_a_different_bundle_is_refused() -> None:
    _, state = started()
    snapshot = machine.to_snapshot(state)
    with pytest.raises(EngineError) as raised:
        machine.from_snapshot(snapshot, bundle(questions=[question(0)]))
    assert raised.value.code == "engine_error"


def test_an_ended_session_restores_as_ended_rather_than_waiting() -> None:
    deck, state = started()
    state, _ = drive(machine.end_early(state), deck, at(3))
    restored = machine.from_snapshot(machine.to_snapshot(state), deck)
    assert restored.awaiting is False
    assert machine.plan(restored, deck, at(4))[1] == Finished()

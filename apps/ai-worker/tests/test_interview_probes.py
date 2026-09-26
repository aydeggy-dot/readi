"""Probe selection and the coverage log — the two halves of "a menu, not a script"."""

from collections.abc import Sequence

from readi_worker.contracts import BundleQuestion, CriterionCoverage
from readi_worker.interview.probes import (
    choose_probe,
    coverage_log,
    covered_by,
    probes_in_play,
)
from tests.interview_fixtures import ORDINARY, TWO_ON_ONE, question


def q(**kwargs: object) -> BundleQuestion:
    return BundleQuestion.model_validate(question(0, **kwargs))  # type: ignore[arg-type]


def test_nothing_asked_and_nothing_covered_leaves_every_probe_in_play() -> None:
    assert probes_in_play(q(), asked=(), covered=()) == (0, 1)


def test_an_asked_probe_and_a_covered_probe_both_leave_play() -> None:
    assert probes_in_play(q(probes=TWO_ON_ONE), asked=(0,), covered=(2,)) == (1,)


def test_the_cap_is_the_first_thing_checked() -> None:
    assert choose_probe(q(), asked=(0,), covered=(), max_follow_ups=1) is None
    assert choose_probe(q(), asked=(), covered=(), max_follow_ups=0) is None


def test_a_criterion_nothing_has_probed_comes_first() -> None:
    """One probe for criterion 1 has been asked; criterion 1's second must wait for criterion 2."""
    asked_first = choose_probe(q(probes=TWO_ON_ONE), asked=(0,), covered=(), max_follow_ups=2)
    assert asked_first == 2


def test_a_second_probe_on_a_criterion_is_reached_only_when_nothing_else_is_open() -> None:
    assert choose_probe(q(probes=TWO_ON_ONE), asked=(0,), covered=(2,), max_follow_ups=2) == 1


def test_probes_are_asked_in_the_order_the_question_lists_them() -> None:
    assert choose_probe(q(probes=TWO_ON_ONE), asked=(), covered=(), max_follow_ups=2) == 0


def test_an_exhausted_menu_chooses_nothing() -> None:
    assert choose_probe(q(), asked=(), covered=(0, 1), max_follow_ups=2) is None
    assert choose_probe(q(probes=()), asked=(), covered=(), max_follow_ups=2) is None


def test_covered_by_drops_indexes_the_question_does_not_have() -> None:
    assert covered_by(q(), answered=[0, 5, -1, 1, 1]) == (0, 1)


# ---- The log.


def verdicts(log: Sequence[CriterionCoverage]) -> list[tuple[int, bool, str]]:
    return [(entry.criterion, entry.has_probe, entry.covered) for entry in log]


def test_the_criterion_the_opening_asks_for_has_no_probe_and_is_never_judged() -> None:
    log = coverage_log(q(), judged=(0, 1), answered=(0,), chosen=1)
    assert verdicts(log) == [
        (0, False, "not_judged"),  # what the opening prompt asked; nothing probes it
        (1, True, "covered"),
        (2, True, "not_covered"),
    ]


def test_the_chosen_probe_is_recorded_against_its_own_criterion_only() -> None:
    log = coverage_log(q(), judged=(0, 1), answered=(), chosen=1)
    chosen = [None if e.follow_up_index is None else e.follow_up_index.root for e in log]
    assert chosen == [None, None, 1]


def test_a_skipped_coverage_call_leaves_every_criterion_not_judged() -> None:
    """The record of the free saving: nothing judged this, so nothing is claimed about it."""
    log = coverage_log(q(), judged=(), answered=(), chosen=None)
    assert {entry.covered for entry in log} == {"not_judged"}
    assert [entry.has_probe for entry in log] == [False, True, True]


def test_a_criterion_is_covered_only_when_both_of_its_probes_are() -> None:
    both = coverage_log(q(probes=TWO_ON_ONE), judged=(0, 1, 2), answered=(0, 1), chosen=2)
    assert verdicts(both)[1] == (1, True, "covered")
    half = coverage_log(q(probes=TWO_ON_ONE), judged=(0, 1, 2), answered=(0,), chosen=1)
    assert verdicts(half)[1] == (1, True, "not_covered"), "one of two probes is not the criterion"


def test_a_partly_judged_criterion_reports_only_what_was_judged() -> None:
    """Probe 1 was never judged, so criterion 1 rests on probe 0 alone rather than on a guess."""
    log = coverage_log(q(probes=TWO_ON_ONE), judged=(0,), answered=(0,), chosen=None)
    assert verdicts(log) == [
        (0, False, "not_judged"),
        (1, True, "covered"),
        (2, True, "not_judged"),
    ]


def test_the_log_has_one_entry_per_criterion_whatever_the_probes_do() -> None:
    for probes in (ORDINARY, TWO_ON_ONE, ()):
        for criteria in (2, 3, 5):
            log = coverage_log(
                q(criteria=criteria, probes=probes), judged=(), answered=(), chosen=None
            )
            assert [entry.criterion for entry in log] == list(range(criteria))


def test_no_per_criterion_view_ever_loses_a_probe() -> None:
    """The general form of the `review-doc.ts` bug, on the shape that caused it.

    A criterion may carry two probes. Anything that builds a per-criterion view by *keying* on the
    criterion keeps only the last of them, and the loss is silent: the interview still runs, it just
    never asks one of the things the question was written to ask. So both halves are asserted —
    every probe is reachable by selection, and the log accounts for every probe rather than for one
    per criterion.
    """
    question = q(probes=TWO_ON_ONE)
    asked: list[int] = []
    while (chosen := choose_probe(question, asked, (), max_follow_ups=len(TWO_ON_ONE))) is not None:
        asked.append(chosen)
    assert sorted(asked) == list(range(len(TWO_ON_ONE))), "every probe is reachable"

    log = coverage_log(question, judged=range(len(TWO_ON_ONE)), answered=(), chosen=None)
    probed = [entry.criterion for entry in log if entry.has_probe]
    assert probed == [1, 2], "two criteria are probed, by three probes between them"
    assert len(log) == question.criterion_count, "one entry per criterion, never per probe"

"""The measurements themselves. Pure arithmetic, so these are the tests that must not be wrong.

The strongest of them is `test_the_written_scores_pass_their_own_checks`: fed the corpus's own
expected scores, the harness must reach the same verdict `check-stress.mjs` reaches on the same
numbers — 102 rubrics, no problems. Two implementations of one rule in two languages, agreeing on
the
real corpus, which is the same arrangement `ask-vectors.json` uses to keep the two ask-counters
honest.
"""

import pytest

from readi_worker.evals.dataset import Criterion, load_dataset, repo_root
from readi_worker.evals.metrics import (
    FAIRNESS_BAND,
    SEPARATION_MARGIN,
    Scored,
    agreement,
    run_metrics,
    separations,
    weighted,
)

THREE = (
    Criterion(position=0, dimension="First", description="a", weight=25, levels={}),
    Criterion(position=1, dimension="Second", description="b", weight=40, levels={}),
    Criterion(position=2, dimension="Third", description="c", weight=35, levels={}),
)


def _five(**scores: tuple[int, ...]) -> list[Scored]:
    return [
        Scored(
            rubric="r", role="frontend", kind=kind.replace("_", "-"), scores=value, expected=value
        )
        for kind, value in scores.items()
    ]


# ---- The corpus against itself.


def test_the_written_scores_pass_their_own_checks() -> None:
    dataset = load_dataset(repo_root())
    scored = [
        Scored(
            rubric=case.rubric.slug,
            role=case.role,
            kind=case.kind,
            scores=case.expected,
            expected=case.expected,
        )
        for case in dataset.cases
    ]
    criteria = {case.rubric.slug: case.rubric.criteria for case in dataset.cases}
    metrics = run_metrics(scored, criteria)
    assert len(metrics.separations) == 102
    assert metrics.problems == (), "check-stress.mjs passes on these; the harness must agree"
    assert metrics.against_expected.exact == 1.0
    assert metrics.against_expected.mae == 0.0
    # The written sets keep the idiom within a rung by construction, in one direction only.
    assert max(metrics.fairness_drifts()) <= FAIRNESS_BAND


# ---- Weighting.


def test_a_weighted_score_uses_the_rubric_weights() -> None:
    assert weighted((4, 4, 4), THREE) == pytest.approx(4.0)
    assert weighted((4, 0, 0), THREE) == pytest.approx(1.0)
    assert weighted((0, 4, 0), THREE) == pytest.approx(1.6)


def test_a_missing_criterion_has_no_weighted_score() -> None:
    """A partial answer is not a low-scoring answer, and must not be averaged as one."""
    assert weighted((4, None, 4), THREE) is None
    assert weighted((4, 4), THREE) is None


# ---- Fairness.


def test_the_idiom_losing_two_rungs_on_one_criterion_is_a_problem() -> None:
    rows = separations(
        _five(strong=(4, 4, 4), nigerian_english=(4, 2, 4)),
        THREE,
    )
    assert rows.worst_fairness_drift == 2
    assert rows.unfair_criteria() == (("Second", 2),)
    assert any("Second" in problem for problem in rows.problems)


def test_one_rung_is_inside_the_band() -> None:
    rows = separations(_five(strong=(4, 4, 4), nigerian_english=(3, 3, 3)), THREE)
    assert rows.unfair_criteria() == ()
    assert [problem for problem in rows.problems if "nigerian" in problem] == []


def test_the_band_is_one_sided() -> None:
    """Scoring the idiom *higher* than `strong` is not a bias against anyone. Reported, never
    failed."""
    rows = separations(_five(strong=(1, 1, 1), nigerian_english=(4, 4, 4)), THREE)
    assert rows.worst_fairness_drift == -3
    assert rows.unfair_criteria() == ()


def test_fairness_is_per_criterion_not_an_average() -> None:
    """A weighted average hides the one descriptor that punished the idiom. That is the whole
    point."""
    rows = separations(_five(strong=(0, 4, 0), nigerian_english=(2, 1, 2)), THREE)
    assert weighted((0, 4, 0), THREE) == pytest.approx(1.6)
    assert weighted((2, 1, 2), THREE) == pytest.approx(1.6)  # identical on the average
    assert rows.unfair_criteria() == (("Second", 3),)  # and unfair on the criterion


# ---- The two separations.


def test_a_rubric_that_cannot_tell_fluent_from_strong_fails() -> None:
    rows = separations(_five(strong=(3, 3, 3), fluent_but_wrong=(3, 3, 3), weak=(0, 0, 0)), THREE)
    assert rows.fluent_gap == pytest.approx(0.0)
    assert any("confident and wrong" in problem for problem in rows.problems)


def test_the_margin_is_a_fifth_of_the_scale() -> None:
    rows = separations(_five(strong=(4, 4, 4), fluent_but_wrong=(3, 3, 3)), THREE)
    assert rows.fluent_gap == pytest.approx(1.0)
    assert rows.fluent_gap is not None
    assert rows.fluent_gap >= SEPARATION_MARGIN
    assert [problem for problem in rows.problems if "confident" in problem] == []


def test_articulacy_is_measured_the_other_way_round() -> None:
    rows = separations(
        _five(correct_poorly_explained=(1, 1, 1), weak=(3, 3, 3)),
        THREE,
    )
    assert any("how it was said" in problem for problem in rows.problems)


def test_an_unscoreable_answer_is_reported_missing_rather_than_scored_zero() -> None:
    rows = separations(
        [
            *_five(strong=(4, 4, 4)),
            Scored(
                rubric="r",
                role="frontend",
                kind="weak",
                scores=(None, None, None),
                expected=(0, 0, 0),
                error="invalid_output",
            ),
        ],
        THREE,
    )
    assert "weak" in rows.missing
    assert any("no score for" in problem for problem in rows.problems)


# ---- Agreement.


def test_agreement_reports_four_things_because_each_hides_something() -> None:
    value = agreement([(3, 3), (2, 3), (4, 2), (1, 1)])
    assert value.n == 4
    assert value.exact == pytest.approx(0.5)
    assert value.within_one == pytest.approx(0.75)  # (4, 2) is two rungs apart
    assert value.mae == pytest.approx(0.75)
    # One rung under, two over: the mean absolute error and the bias are different questions.
    assert value.bias == pytest.approx(0.25)


def test_a_uniformly_generous_model_is_invisible_to_correlation_and_obvious_in_bias() -> None:
    value = agreement([(3, 1), (4, 2), (2, 0)])
    assert value.correlation == pytest.approx(1.0)
    assert value.bias == pytest.approx(2.0)
    assert value.exact == 0.0


def test_a_correlation_with_a_constant_is_undefined_rather_than_zero() -> None:
    assert agreement([(2, 3), (2, 4), (2, 1)]).correlation is None
    assert agreement([(2, 2)]).correlation is None


def test_an_empty_agreement_says_so() -> None:
    assert agreement([]).empty


# ---- The run's verdict.


def test_fairness_problems_come_first() -> None:
    """The owner's instruction: a bias against our core users outranks every other finding."""
    scored = [
        *_five(strong=(4, 4, 4), fluent_but_wrong=(4, 4, 4), nigerian_english=(1, 1, 1)),
    ]
    metrics = run_metrics(scored, {"r": THREE})
    assert len(metrics.problems) >= 2
    assert "nigerian-english" in metrics.problems[0]
    assert len(metrics.unfair) == 1


def test_a_failed_answer_is_excluded_from_agreement_and_named() -> None:
    scored = [
        Scored(rubric="r", role="q", kind="strong", scores=(3, 3, 3), expected=(3, 3, 3)),
        Scored(
            rubric="r",
            role="q",
            kind="weak",
            scores=(None, None, None),
            expected=(0, 0, 0),
            error="refused",
        ),
    ]
    metrics = run_metrics(scored, {"r": THREE})
    assert metrics.against_expected.n == 3
    assert metrics.failures == ("r/weak: refused",)

"""What the rendered report claims, and what it must refuse to claim.

These exist because of one line the 2026-09-28 opus run printed: **"fluency: 11 of 11 rubrics
separated"**, when two of those eleven rubrics had no `fluent-but-wrong` score at all and could not
be measured either way. A denominator that absorbs an unmeasurable pair reports it as a pass, which
is the same failure as a threshold nothing can fail — and `--smoke` can never catch it, because the
stand-in evaluator scores every answer it is given.
"""

from readi_worker.evals.dataset import Criterion
from readi_worker.evals.metrics import Scored, run_metrics
from readi_worker.evals.report import render_run
from readi_worker.evals.results import CaseResult, RunResult, Usage

THREE = (
    Criterion(position=0, dimension="First", description="a", weight=25, levels={}),
    Criterion(position=1, dimension="Second", description="b", weight=40, levels={}),
    Criterion(position=2, dimension="Third", description="c", weight=35, levels={}),
)

#: `strong`, `weak` and the idiom score; `fluent-but-wrong` and `correct-poorly-explained` do not.
#: So fluency has no gap, articulacy has none either, and fairness *does* — three different answers
#: on one rubric, which is the point.
PARTIAL = (
    ("strong", (4, 4, 4), None),
    ("weak", (1, 1, 1), None),
    ("fluent-but-wrong", (None, None, None), "invalid_output"),
    ("correct-poorly-explained", (None, None, None), "provider_error"),
    ("nigerian-english", (4, 4, 3), None),
)


def _run(
    rows: tuple[tuple[str, tuple[int | None, ...], str | None], ...], **kwargs: object
) -> RunResult:
    return RunResult.model_validate(
        {
            "label": "test",
            "dataset": "synthetic",
            "provenance": "ai_draft",
            "provider": "anthropic",
            "model": "claude-opus-5",
            "started_at": "2026-09-28T00:00:00+00:00",
            "finished_at": "2026-09-28T00:10:00+00:00",
            "cache_system": True,
            "cases": [
                {
                    "rubric": "r",
                    "role": "frontend",
                    "kind": kind,
                    "question": "q",
                    "scores": list(scores),
                    "expected": [4, 4, 4],
                    "evidence": [1, 1, 1],
                    "error": error,
                }
                for kind, scores, error in rows
            ],
            **kwargs,
        }
    )


def _render(result: RunResult) -> str:
    return render_run(result, {"r": THREE})


# ---- The counting.


def test_an_unmeasurable_separation_is_not_counted_as_a_pass() -> None:
    report = _render(_run(PARTIAL))
    assert "of 0** rubrics separated" not in report
    assert "- fluency: **not measured**" in report
    assert "- articulacy: **not measured**" in report
    # And it says which rubric, rather than leaving a reader to work out what is absent.
    assert "no rubric has both answers (`r`)" in report


def test_a_measured_separation_is_counted_over_the_measured_rubrics_only() -> None:
    rows = (
        ("strong", (4, 4, 4), None),
        ("weak", (1, 1, 1), None),
        ("fluent-but-wrong", (0, 0, 0), None),
        ("correct-poorly-explained", (3, 3, 3), None),
        ("nigerian-english", (4, 4, 4), None),
    )
    report = _render(_run(rows))
    assert "- fluency: **1 of 1** rubrics separated" in report
    assert "not measured" not in report.split("## Agreement")[0].split("## The two separations")[1]


def test_fairness_counts_comparable_rubrics_and_names_the_rest() -> None:
    # `strong` scored, the idiom did not: nothing to compare, and a tuple of `None` drifts is
    # truthy, which is how "0 of 12 rubrics" was printed for 9 comparable ones.
    rows = (
        ("strong", (4, 4, 4), None),
        ("nigerian-english", (None, None, None), "provider_error"),
    )
    metrics = run_metrics(
        [
            Scored(
                rubric="r",
                role="frontend",
                kind=kind,
                scores=scores,
                expected=(4, 4, 4),
                error=error,
            )
            for kind, scores, error in rows
        ],
        {"r": THREE},
    )
    assert metrics.separations[0].fairness_measured is False
    report = _render(_run(rows))
    assert "**Not measured.**" in report


def test_fairness_names_the_rubrics_it_could_not_compare() -> None:
    report = _render(
        _run(
            (
                ("strong", (4, 4, 4), None),
                ("nigerian-english", (4, 4, 3), None),
            )
        )
    )
    assert "**0 of 1 comparable rubrics**" in report
    assert "no comparable pair" not in report


# ---- Why calls bought nothing.


def test_the_causes_of_rejection_are_named_with_their_share() -> None:
    result = _run(PARTIAL)
    result.cases[0].call_errors = ["rejected_evidence", "rejected_evidence"]
    result.cases[0].usage = Usage(calls=3, rejected=2)
    result.cases[2].call_errors = ["rejected_criteria"]
    result.cases[2].usage = Usage(calls=1, rejected=1)
    report = _render(result)
    assert "## Why calls bought nothing" in report
    assert "| `rejected_evidence` | 2 | 50% |" in report
    assert "| `rejected_criteria` | 1 | 25% |" in report
    assert "spec §6.2" in report


def test_a_run_from_before_the_codes_existed_says_so_rather_than_nothing() -> None:
    result = _run(PARTIAL)
    result.cases[0].usage = Usage(calls=3, rejected=2)
    report = _render(result)
    assert "**Not recorded.**" in report
    assert "cannot be recovered" in report


def test_a_clean_run_says_nothing_was_rejected() -> None:
    result = _run(
        (
            ("strong", (4, 4, 4), None),
            ("nigerian-english", (4, 4, 4), None),
        )
    )
    assert "Nothing was rejected and nothing failed." in _render(result)


# ---- A retry says it is one.


def test_a_retried_run_says_its_totals_span_two_runs() -> None:
    result = _run(PARTIAL, retried_from="20260928T013039Z-claude-opus-5.json")
    report = _render(result)
    assert "**a retry**" in report
    assert "20260928T013039Z-claude-opus-5.json" in report
    assert "span two runs" in report


def test_case_results_carry_no_call_errors_by_default() -> None:
    assert (
        CaseResult(
            rubric="r", role="frontend", kind="strong", question="q", scores=[1], expected=[1]
        ).call_errors
        == []
    )


def test_rejections_with_no_recorded_cause_are_not_left_out_of_the_table() -> None:
    """A merged retry holds a pre-codes run's rejections in the count and not in the table.

    Presenting the attributed part as the whole is the same flaw this section exists to remove, one
    level down: the first merged opus run said "7 of 110 calls" where 32 readings were discarded.
    """
    result = _run(PARTIAL)
    result.cases[0].call_errors = ["rejected_criteria"]
    result.cases[0].usage = Usage(calls=10, rejected=8)
    report = _render(result)
    assert "| `rejected_criteria` | 1 | 10% |" in report
    assert "**7 further reading(s) were thrown away with no cause recorded**" in report
    assert "cannot be recovered" in report


def test_a_fully_attributed_run_says_nothing_about_missing_causes() -> None:
    result = _run(PARTIAL)
    result.cases[0].call_errors = ["rejected_criteria", "rejected_evidence"]
    result.cases[0].usage = Usage(calls=3, rejected=2)
    assert "no cause recorded" not in _render(result)

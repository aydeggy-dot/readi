"""The harness runs end to end on the stand-in evaluator, and the sample is chosen deliberately.

`--smoke` is in `pnpm test` for the M2.5 reason: a test that only runs when asked is a test that
rots,
and this harness is otherwise dispatched by hand. What it asserts is the **machinery** — every
answer
came back with one score per criterion, every non-zero criterion carries a verified quote, nothing
was
billed — and never the fairness band or the separations, because the stand-in scores on whether the
word "because" appears. A green separation against that would be a coin toss with a tick beside it.
"""

import json
import logging
from pathlib import Path

import pytest

from readi_worker.contracts import EvaluateAnswerResponse
from readi_worker.evals.dataset import KINDS, Case, DatasetError, load_dataset, repo_root
from readi_worker.evals.metrics import agreement
from readi_worker.evals.results import CaseResult, RunResult, compare
from readi_worker.evals.run import (
    DEFAULT_SAMPLE,
    load_thresholds,
    main,
    stratified_sample,
)

ROOT = repo_root()


def test_the_smoke_run_passes_on_the_stand_in(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "smoke.json"
    assert main(["--smoke", "--out", str(out)]) == 0
    result = RunResult.read(out)
    assert result.provider == "fake"
    assert len(result.cases) == 2 * len(KINDS)
    assert [case for case in result.cases if case.error] == []
    assert result.usage.cost_micro_usd == 0
    # `cache_system` is recorded as off for a fake run, because nothing was cached: the flag on the
    # file has to describe what happened, or a cost comparison read from two files is meaningless.
    assert result.cache_system is False
    report = capsys.readouterr().out
    assert "Fairness: does the idiom cost marks?" in report
    # Fairness leads the page. The order is the finding, not a layout preference.
    assert report.index("Fairness") < report.index("The two separations") < report.index("Cost")


def test_the_smoke_run_fails_when_a_non_zero_score_has_no_quote(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Watched failing: spec §6.2 is the rule, and a harness that cannot see it break cannot hold
    it."""
    import readi_worker.evals.run as module

    real = module._case_result

    def strip_quotes(case: Case, response: EvaluateAnswerResponse) -> CaseResult:
        result = real(case, response)
        return result.model_copy(update={"evidence": [0] * len(result.scores)})

    monkeypatch.setattr(module, "_case_result", strip_quotes)
    assert main(["--smoke", "--out", str(tmp_path / "smoke.json")]) == 1


def test_a_dry_run_makes_no_call_and_prices_the_sample(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert (
        main(["--dry-run", "--sample", "3", "--model", "claude-opus-5", "--no-count-tokens"]) == 0
    )
    printed = capsys.readouterr().out
    assert "15 answers over 3 rubrics" in printed
    assert "claude-opus-5" in printed
    assert "cached, sequential" in printed
    # The system prompt clears opus-5's 512-token minimum, so the run will actually cache.
    assert "so it caches" in printed


def test_an_unknown_dataset_exits_two(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--dataset", "nonexistent"]) == 2
    assert "no such dataset" in capsys.readouterr().err


def test_a_run_without_a_key_says_what_to_do_instead(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert main(["--sample", "1"]) == 2
    assert "--provider fake" in capsys.readouterr().err


def test_two_runs_can_be_compared_from_their_files(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    left, right = tmp_path / "left.json", tmp_path / "right.json"
    assert main(["--smoke", "--out", str(left)]) == 0
    assert main(["--smoke", "--out", str(right)]) == 0
    # Stand it in as a different model so the comparison has two names to print.
    data = json.loads(right.read_text())
    data["model"] = "claude-sonnet-5"
    right.write_text(json.dumps(data))
    capsys.readouterr()
    assert main(["--compare", str(left), str(right)]) == 0
    printed = capsys.readouterr().out
    assert "claude-sonnet-5" in printed
    comparison = compare(RunResult.read(left), RunResult.read(right))
    # The same answers scored twice by the same stand-in: perfect agreement, which is the sanity
    # check
    # that the comparison lines up cases by rubric and kind rather than by position.
    assert comparison.shared_cases == 2 * len(KINDS)
    assert comparison.between.exact == 1.0
    assert comparison.left_only == 0
    assert comparison.right_only == 0


def test_compare_needs_exactly_two_files(tmp_path: Path) -> None:
    out = tmp_path / "one.json"
    assert main(["--smoke", "--out", str(out)]) == 0
    assert main(["--compare", str(out)]) == 2


# ---- Sampling.


def test_the_sample_is_whole_rubrics_and_deterministic() -> None:
    dataset = load_dataset(ROOT)
    first = stratified_sample(dataset, DEFAULT_SAMPLE, seed=7)
    assert len(first) == DEFAULT_SAMPLE
    assert first == stratified_sample(dataset, DEFAULT_SAMPLE, seed=7)
    assert first != stratified_sample(dataset, DEFAULT_SAMPLE, seed=8)


def test_the_sample_spreads_across_roles_and_question_types() -> None:
    """Round-robin over strata, so forty frontend technical rubrics cannot crowd out the rest."""
    dataset = load_dataset(ROOT)
    chosen = set(stratified_sample(dataset, DEFAULT_SAMPLE, seed=7))
    picked = [case for case in dataset.cases if case.rubric.slug in chosen]
    assert len({case.role for case in picked}) == 3
    assert len({case.question.type for case in picked}) >= 3


def test_asking_for_more_rubrics_than_exist_returns_all_of_them() -> None:
    dataset = load_dataset(ROOT, "synthetic")
    assert len(stratified_sample(dataset, 10_000, seed=1)) == len(dataset.rubrics())


# ---- The thresholds file, which exists only if something reads it.


def test_the_thresholds_file_is_read_and_complete() -> None:
    thresholds = load_thresholds(ROOT)
    assert thresholds.enforce_on_provenance == "human"
    assert 0 < thresholds.min_exact <= thresholds.min_within_one <= 1


def test_agreement_cannot_fail_a_model_written_dataset() -> None:
    """Against `synthetic` the figures measure the drafter agreeing with itself. A threshold on that
    would fail a run for the wrong reason, or pass it for one."""
    thresholds = load_thresholds(ROOT)
    assert thresholds.applies_to("human")
    assert not thresholds.applies_to("ai_draft")


def test_agreement_below_the_thresholds_is_a_problem() -> None:
    thresholds = load_thresholds(ROOT)
    # Half the criteria two rungs out: past every one of the four figures.
    problems = thresholds.problems(agreement([(4, 2)] * 5 + [(2, 2)] * 5))
    assert len(problems) == 4
    assert thresholds.problems(agreement([(3, 3)] * 10)) == ()


def test_a_thresholds_file_missing_a_key_says_which(tmp_path: Path) -> None:
    (tmp_path / "content" / "seed").mkdir(parents=True)
    (tmp_path / "evals").mkdir()
    (tmp_path / "evals" / "thresholds.yaml").write_text(
        "agreement:\n  enforce_on_provenance: human\n", encoding="utf-8"
    )
    with pytest.raises(DatasetError, match="min_exact"):
        load_thresholds(tmp_path)


# ---- Per-call causes, and finishing a run that could not finish itself.


def _call(code: str | None) -> dict[str, object]:
    """One `AiCallRecord` as the worker reports it, with or without a cause."""
    return {
        "purpose": "evaluator",
        "provider": "anthropic",
        "model": "claude-opus-5",
        "status": "ok" if code is None else "error",
        "error_code": code,
        "latency_ms": 1000,
        "input_units": 10,
        "output_units": 10,
        "cache_write_units": 0,
        "cache_read_units": 0,
        "unit_kind": "tokens",
        "cost_micro_usd": 100,
        "langfuse_trace_id": None,
    }


def _response(*codes: str | None) -> EvaluateAnswerResponse:
    return EvaluateAnswerResponse.model_validate(
        {
            "position": 0,
            "evaluation": None,
            "error": "invalid_output",
            "evidence_flags": [],
            "prompt_versions": {},
            "ai_calls": [_call(code) for code in codes],
        }
    )


def test_a_case_records_which_gate_threw_each_reading_away() -> None:
    """The count was never the useful half: `33% rejected` cannot be acted on, a gate name can."""
    import readi_worker.evals.run as module

    case = load_dataset(ROOT).cases[0]
    result = module._case_result(case, _response("rejected_evidence", "rejected_evidence", None))
    assert result.call_errors == ["rejected_evidence", "rejected_evidence"]
    assert result.usage.rejected == 2
    assert result.usage.calls == 3


def test_a_provider_failure_is_recorded_beside_a_rejection_and_told_apart() -> None:
    import readi_worker.evals.run as module

    case = load_dataset(ROOT).cases[0]
    result = module._case_result(case, _response("BadRequestError", "rejected_criteria"))
    assert result.call_errors == ["BadRequestError", "rejected_criteria"]
    # A 400 is not a rejected reading: nothing was read and nothing was billed for it.
    assert result.usage.rejected == 1


def _with_one_unscored(path: Path) -> tuple[str, str]:
    """Mark the second case of a finished run unscored, as a provider failure would leave it."""
    data = json.loads(path.read_text())
    case = data["cases"][1]
    case["scores"] = [None] * len(case["scores"])
    case["error"] = "provider_error"
    case["call_errors"] = ["BadRequestError"]
    case["usage"] = {"calls": 3, "rejected": 0, "failed": 1, "cost_micro_usd": 0}
    path.write_text(json.dumps(data))
    return case["rubric"], case["kind"]


def test_a_retry_scores_only_what_was_unscored_and_merges_it_back(tmp_path: Path) -> None:
    previous = tmp_path / "previous.json"
    assert main(["--smoke", "--out", str(previous)]) == 0
    rubric, kind = _with_one_unscored(previous)
    before = RunResult.read(previous)

    merged_path = tmp_path / "merged.json"
    assert main(["--smoke", "--retry-unscored", str(previous), "--out", str(merged_path)]) == 0
    merged = RunResult.read(merged_path)

    assert len(merged.cases) == len(before.cases), "a merge completes a run, it does not shorten it"
    assert merged.retried_from == "previous.json"
    assert [case for case in merged.cases if case.error] == []
    retried = next(case for case in merged.cases if (case.rubric, case.kind) == (rubric, kind))
    assert all(score is not None for score in retried.scores)
    # Both attempts' cost and both attempts' causes: the first three calls were made and paid for,
    # and a merged file cheaper than the bill is not a measurement (ADR-0007).
    assert retried.usage.calls == 3 + 1
    assert retried.call_errors[0] == "BadRequestError"
    # The answers that scored the first time are carried over untouched.
    kept = next(case for case in merged.cases if (case.rubric, case.kind) != (rubric, kind))
    assert kept == next(
        case for case in before.cases if (case.rubric, case.kind) == (kept.rubric, kept.kind)
    )


def test_a_retry_refuses_a_different_model_before_it_spends_anything(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    previous = tmp_path / "previous.json"
    assert main(["--smoke", "--out", str(previous)]) == 0
    _with_one_unscored(previous)
    assert main(["--retry-unscored", str(previous), "--model", "claude-opus-5"]) == 2
    printed = capsys.readouterr().err
    assert "--model fake" in printed, "it must name the model that would make the file coherent"


def test_a_retry_of_a_complete_run_says_there_is_nothing_to_do(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    previous = tmp_path / "previous.json"
    assert main(["--smoke", "--out", str(previous)]) == 0
    assert main(["--smoke", "--retry-unscored", str(previous)]) == 2
    assert "nothing to retry" in capsys.readouterr().err


def test_a_merged_retry_does_not_report_an_answer_it_scored_as_unscoreable(tmp_path: Path) -> None:
    """`failed` is one per answer, not per attempt: the one figure a merge may not add up."""
    previous = tmp_path / "previous.json"
    assert main(["--smoke", "--out", str(previous)]) == 0
    _with_one_unscored(previous)
    merged_path = tmp_path / "merged.json"
    assert main(["--smoke", "--retry-unscored", str(previous), "--out", str(merged_path)]) == 0
    merged = RunResult.read(merged_path)
    assert merged.usage.failed == 0, "every answer has a score; none may still be counted as failed"
    # The cost of the attempt that failed is still there, which is the half that must stay additive.
    retried = next(case for case in merged.cases if case.usage.calls > 1)
    assert retried.usage.calls == 4


# ---- What a stopped run keeps, and what a watched run says.


def test_a_run_lets_the_workers_own_log_lines_through(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """The gap that made the 2026-09-28 v3 check unreadable.

    `_Checked.detail` carries `expected 0, 1, 2; got 1, 2, 3` into a `logger.info`, and a CLI
    configures no logging — so the root logger sat at WARNING, the line went nowhere, and a run that
    threw away 17 readings could not say what any of them was.
    """
    assert main(["--smoke", "--out", str(tmp_path / "smoke.json")]) == 0
    capsys.readouterr()
    logging.getLogger("readi_worker.evaluation.service").info(
        "evaluation position 0 attempt 1 rejected: criteria (expected 0, 1; got 0)"
    )
    assert "expected 0, 1; got 0" in capsys.readouterr().err


def test_a_run_writes_what_it_planned_and_keeps_what_it_scored(tmp_path: Path) -> None:
    out = tmp_path / "run.json"
    assert main(["--smoke", "--out", str(out)]) == 0
    result = RunResult.read(out)
    assert len(result.planned) == len(result.cases)
    assert f"{result.cases[0].rubric}/{result.cases[0].kind}" in result.planned


def test_a_stopped_run_is_finished_by_a_retry_rather_than_run_again(tmp_path: Path) -> None:
    """A run killed at a spending cap keeps what it scored, and `--retry-unscored` completes it.

    Simulated the way a kill leaves it: the answers up to the cut are on disk, the rest are in
    `planned` and nowhere else. Without `planned` the partial file could never become a whole run —
    which would make checkpointing worth half of what it is worth.
    """
    previous = tmp_path / "stopped.json"
    assert main(["--smoke", "--out", str(previous)]) == 0
    data = json.loads(previous.read_text())
    whole = len(data["cases"])
    data["cases"] = data["cases"][:3]
    previous.write_text(json.dumps(data))

    merged_path = tmp_path / "finished.json"
    assert main(["--smoke", "--retry-unscored", str(previous), "--out", str(merged_path)]) == 0
    merged = RunResult.read(merged_path)
    assert len(merged.cases) == whole, "the retry scored the answers the stop never reached"
    assert [case for case in merged.cases if case.error] == []
    assert merged.retried_from == "stopped.json"

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

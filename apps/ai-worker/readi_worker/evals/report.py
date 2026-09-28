"""A run, written out for a person to read. Markdown, because it ends up in a handover.

The order is the order of importance and is not negotiable: **fairness first**, then the two
separations, then agreement, then cost. A report that led with the cost table would invite the
reading where a cheaper model wins on a page that has not yet said whether it is fair to the
candidates this product launches for.
"""

from collections.abc import Mapping, Sequence

from readi_worker.evals.dataset import FAIRNESS_KIND, KINDS, Criterion
from readi_worker.evals.metrics import (
    FAIRNESS_BAND,
    SEPARATION_MARGIN,
    Agreement,
    RunMetrics,
    run_metrics,
)
from readi_worker.evals.results import Comparison, RunResult, Usage

#: What a session costs to score, in answers. `INTERVIEW_PLANS` is 4 questions at 15 minutes and 8
#: at 30, so a per-answer figure projects onto both without anybody doing the arithmetic in their
#: head.
SESSION_ANSWERS = (("15-minute session", 4), ("30-minute session", 8))


def render_run(result: RunResult, criteria: Mapping[str, Sequence[Criterion]]) -> str:
    metrics = run_metrics(result.scored(), criteria)
    lines = [
        f"# Evaluator run — {result.model} on `{result.dataset}`",
        "",
        f"- **{len(result.cases)} answers** over {len(metrics.separations)} rubrics, "
        f"{result.provider}/{result.model}",
        f"- prompt cache on the system prompt: **{'on' if result.cache_system else 'off'}**",
        f"- prompts: {_versions(result.prompt_versions)}",
        f"- {result.started_at} to {result.finished_at}",
        "",
        _provenance_note(result.provenance),
        "",
        *_fairness(metrics),
        "",
        *_separations(metrics),
        "",
        *_agreement(metrics, result.provenance),
        "",
        *_evidence(result),
        "",
        *_cost(result),
    ]
    if metrics.failures:
        lines += [
            "",
            f"## {len(metrics.failures)} answer(s) with no score",
            "",
            "An answer the model would not read is reported, never counted as 0.",
            "",
            *(f"- `{failure}`" for failure in metrics.failures),
        ]
    return "\n".join(lines) + "\n"


def _provenance_note(provenance: str) -> str:
    if provenance == "human":
        return (
            "The expected scores in this dataset were written by people, so the agreement figures "
            "below are the real metric."
        )
    return (
        f"> The expected scores in this dataset are **{provenance}** - model-written and "
        "model-scored (`evals/datasets/synthetic/README.md`). Agreement with them is a "
        "**regression baseline**: it says whether a fixed answer's score has moved, and nothing at "
        "all about whether the score is right. The fairness band and the two separations below do "
        "not depend on them and are the measurements that mean something today."
    )


# ---- The three measurements.


def _fairness(metrics: RunMetrics) -> list[str]:
    unfair = metrics.unfair
    drifts = metrics.fairness_drifts()
    measured = len([row for row in metrics.separations if row.fairness_drift])
    lines = [
        "## Fairness: does the idiom cost marks?",
        "",
        f"`{FAIRNESS_KIND}` says the same things as `strong` in the English a Nigerian candidate "
        f"actually uses. Every criterion where it scores more than {FAIRNESS_BAND} rung below "
        "`strong` is a descriptor rewarding phrasing rather than engineering - a bias against the "
        "candidates this product launches for (CLAUDE.md product principle 3).",
        "",
    ]
    if not drifts:
        lines.append(
            "**Not measured.** This run scored no rubric with both a `strong` and a "
            f"`{FAIRNESS_KIND}` answer."
        )
        return lines
    worse = len([drift for drift in drifts if drift > FAIRNESS_BAND])
    lines += [
        f"- **{len(unfair)} of {measured} rubrics** have at least one criterion outside the band",
        f"- {worse} of {len(drifts)} criteria scored more than {FAIRNESS_BAND} rung lower; "
        f"mean drift {sum(drifts) / len(drifts):+.2f} rungs, worst {max(drifts):+d}",
        "- drift distribution (`strong` minus the idiom, per criterion): "
        + ", ".join(f"{value:+d}: {drifts.count(value)}" for value in sorted(set(drifts))),
    ]
    if unfair:
        lines += [
            "",
            "The criteria to read again, worst first:",
            "",
            "| rubric | criterion | rungs lost |",
            "| --- | --- | --- |",
        ]
        rows = sorted(
            (
                (row.rubric, dimension, drift)
                for row in unfair
                for dimension, drift in row.unfair_criteria()
            ),
            key=lambda row: -row[2],
        )
        lines += [f"| `{rubric}` | {dimension} | {drift:+d} |" for rubric, dimension, drift in rows]
    else:
        lines += [
            "",
            "**No criterion outside the band.** On this sample the evaluator reads the engineering "
            "rather than the English.",
        ]
    return lines


def _separations(metrics: RunMetrics) -> list[str]:
    rows = [
        row
        for row in metrics.separations
        if row.fluent_gap is not None or row.poorly_gap is not None
    ]
    lines = [
        "## The two separations",
        "",
        f"On the weighted 0 to 4 score, with `check-stress.mjs`'s margin of {SEPARATION_MARGIN}: "
        "`fluent-but-wrong` must land clearly below `strong` (or the evaluator is scoring "
        "fluency), and `correct-poorly-explained` clearly above `weak` (or it is scoring "
        "articulacy).",
        "",
    ]
    if not rows:
        lines.append("**Not measured** on this sample.")
        return lines
    fluent_failures = [
        row for row in rows if row.fluent_gap is not None and row.fluent_gap < SEPARATION_MARGIN
    ]
    poorly_failures = [
        row for row in rows if row.poorly_gap is not None and row.poorly_gap < SEPARATION_MARGIN
    ]
    lines += [
        f"- fluency: **{len(rows) - len(fluent_failures)} of {len(rows)}** rubrics separated",
        f"- articulacy: **{len(rows) - len(poorly_failures)} of {len(rows)}** rubrics separated",
        "",
        "| rubric | strong | fluent | poorly | weak | separations |",
        "| --- | --: | --: | --: | --: | --- |",
    ]
    for row in sorted(rows, key=lambda row: row.fluent_gap if row.fluent_gap is not None else 99):
        lines.append(
            f"| `{row.rubric}` | {_num(row.weighted.get('strong'))} | "
            f"{_num(row.weighted.get('fluent-but-wrong'))} | "
            f"{_num(row.weighted.get('correct-poorly-explained'))} | "
            f"{_num(row.weighted.get('weak'))} | {_gap(row.fluent_gap)} / {_gap(row.poorly_gap)} |"
        )
    return lines


def _agreement(metrics: RunMetrics, provenance: str) -> list[str]:
    against = "the human scores" if provenance == "human" else "the written expectations"
    lines = [
        f"## Agreement with {against}",
        "",
        "Per criterion, not per answer.",
        "",
        "| slice | criteria | exact | within one | MAE | r | bias |",
        "| --- | --: | --: | --: | --: | --: | --: |",
        _agreement_row("all", metrics.against_expected),
    ]
    lines += [
        _agreement_row(f"`{kind}`", metrics.by_kind[kind])
        for kind in KINDS
        if kind in metrics.by_kind
    ]
    lines += [
        "",
        "`bias` is the model minus the expectation: positive means the model marks more "
        "generously.",
        "",
        "`evals/thresholds.yaml` is enforced on a **human-scored** dataset only, and this one is "
        f"`{provenance}`, so the figures above failed nothing."
        if provenance != "human"
        else "`evals/thresholds.yaml` is enforced on this run.",
    ]
    return lines


def _agreement_row(label: str, value: Agreement) -> str:
    if value.empty:
        return f"| {label} | 0 | — | — | — | — | — |"
    correlation = "—" if value.correlation is None else f"{value.correlation:.2f}"
    return (
        f"| {label} | {value.n} | {value.exact:.0%} | {value.within_one:.0%} | "
        f"{value.mae:.2f} | {correlation} | {value.bias:+.2f} |"
    )


def _evidence(result: RunResult) -> list[str]:
    violations = sum(case.evidence_violations() for case in result.cases)
    quoted = sum(quotes for case in result.cases for quotes in case.evidence)
    flagged = [case for case in result.cases if case.evidence_flags]
    lines = [
        "## The evidence rule",
        "",
        f"Spec §6.2: every non-zero criterion carries at least one quote, verified in code against "
        f"the candidate's own words. **{violations} violation(s)** over "
        f"{len(result.cases)} answers ({quoted} quotes kept).",
    ]
    if flagged:
        lines += [
            "",
            f"{len(flagged)} answer(s) had evidence that reads like an instruction "
            f"(`evidence_flags`; it changes no score and reaches no candidate): "
            + ", ".join(f"`{case.rubric}/{case.kind}`" for case in flagged[:8]),
        ]
    return lines


# ---- Cost.


def _cost(result: RunResult) -> list[str]:
    usage = result.usage
    answers = len([case for case in result.cases if case.error is None]) or 1
    per_answer = usage.cost_micro_usd / answers
    hit = usage.cache_hit_rate
    lines = [
        "## Cost",
        "",
        f"- **{_usd(usage.cost_micro_usd)}** for {usage.calls} calls over "
        f"{len(result.cases)} answers ({usage.rejected} rejected reading(s), "
        f"{usage.failed} unscoreable)",
        f"- {_cents(per_answer)} per answer; "
        + "; ".join(
            f"{_cents(per_answer * count)} per {label}" for label, count in SESSION_ANSWERS
        ),
        f"- prompt tokens {usage.prompt_tokens:,} = {usage.input_tokens:,} full price "
        f"+ {usage.cache_write_tokens:,} cache writes + {usage.cache_read_tokens:,} cache reads"
        + (f" (**{hit:.0%} served from cache**)" if hit is not None else ""),
        f"- output tokens {usage.output_tokens:,}",
        f"- {usage.latency_ms / max(1, usage.calls) / 1000:.1f} s per call on average",
    ]
    if result.cache_system and usage.cache_read_tokens == 0 and usage.calls > 1:
        lines += [
            "",
            "> **Caching was asked for and nothing was read back.** Every call paid the 1.25x "
            "write premium and no call benefited, which is strictly worse than not caching. "
            "Either the "
            "system prompt is under the model's minimum cacheable prefix "
            "(`MIN_CACHEABLE_PREFIX_TOKENS`), something in it varies between calls, or the run was "
            "concurrent enough that no call could read what the others had not finished writing.",
        ]
    return lines


# ---- Two models on one sample.


def render_comparison(comparison: Comparison, left: RunResult, right: RunResult) -> str:
    left_usage, right_usage = left.usage, right.usage
    left_answers = max(1, len([case for case in left.cases if case.error is None]))
    right_answers = max(1, len([case for case in right.cases if case.error is None]))
    left_per = left_usage.cost_micro_usd / left_answers
    right_per = right_usage.cost_micro_usd / right_answers
    lines = [
        f"# {comparison.left} against {comparison.right}",
        "",
        f"{comparison.shared_cases} answers scored by both"
        + (
            f" ({comparison.left_only} only by {comparison.left}, "
            f"{comparison.right_only} only by {comparison.right})"
            if comparison.left_only or comparison.right_only
            else ""
        ),
        "",
        "## Do they read the same answers the same way?",
        "",
        "| | criteria | exact | within one | MAE | r | bias |",
        "| --- | --: | --: | --: | --: | --: | --: |",
        _agreement_row(f"{comparison.left} vs {comparison.right}", comparison.between),
        _agreement_row(f"{comparison.left} vs expected", comparison.left_vs_expected),
        _agreement_row(f"{comparison.right} vs expected", comparison.right_vs_expected),
        "",
        f"Mean criterion score: {comparison.left_mean:.2f} ({comparison.left}) against "
        f"{comparison.right_mean:.2f} ({comparison.right}) — a difference of "
        f"{comparison.left_mean - comparison.right_mean:+.2f} rungs.",
        "",
        "## What each costs",
        "",
        "| | per answer | 15-minute session | 30-minute session | cache hit |",
        "| --- | --: | --: | --: | --: |",
        _cost_row(comparison.left, left_per, left_usage),
        _cost_row(comparison.right, right_per, right_usage),
        "",
        f"{comparison.right} is {_ratio(right_per, left_per)} the cost of {comparison.left} "
        "per answer on this sample.",
    ]
    return "\n".join(lines) + "\n"


def _cost_row(model: str, per_answer: float, usage: Usage) -> str:
    hit = usage.cache_hit_rate
    return (
        f"| {model} | {_cents(per_answer)} | "
        + " | ".join(_cents(per_answer * count) for _, count in SESSION_ANSWERS)
        + f" | {'—' if hit is None else f'{hit:.0%}'} |"
    )


# ---- Formatting.


def _versions(versions: dict[str, int]) -> str:
    return ", ".join(f"`{name}` v{version}" for name, version in sorted(versions.items())) or "none"


def _num(value: float | None) -> str:
    return "—" if value is None else f"{value:.2f}"


def _gap(value: float | None) -> str:
    return "—" if value is None else f"+{value:.2f}"


def _usd(micro: float) -> str:
    return f"${micro / 1_000_000:.2f}" if micro >= 1_000_000 else _cents(micro)


def _cents(micro: float) -> str:
    return f"{micro / 10_000:.2f}¢"


def _ratio(numerator: float, denominator: float) -> str:
    return "—" if denominator == 0 else f"{numerator / denominator:.0%} of"

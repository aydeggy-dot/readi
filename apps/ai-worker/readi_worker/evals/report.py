"""A run, written out for a person to read. Markdown, because it ends up in a handover.

The order is the order of importance and is not negotiable: **fairness first**, then the two
separations, then agreement, then cost. A report that led with the cost table would invite the
reading where a cheaper model wins on a page that has not yet said whether it is fair to the
candidates this product launches for.
"""

from collections.abc import Callable, Mapping, Sequence

from readi_worker.evals.dataset import FAIRNESS_KIND, KINDS, Criterion
from readi_worker.evals.metrics import (
    FAIRNESS_BAND,
    SEPARATION_MARGIN,
    Agreement,
    RunMetrics,
    Separation,
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
        *(
            [
                f"- **a retry**: the answers `{result.retried_from}` could not score, re-scored "
                "and merged back in. A retried answer's cost is both attempts', so the totals "
                "below span two runs.",
            ]
            if result.retried_from
            else []
        ),
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
        *_rejections(result),
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
    comparable = [row for row in metrics.separations if row.fairness_measured]
    unmeasured = [row.rubric for row in metrics.separations if not row.fairness_measured]
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
        f"- **{len(unfair)} of {len(comparable)} comparable rubrics** have at least one criterion "
        "outside the band" + _unmeasured_note(unmeasured, "no comparable pair"),
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
    everything = list(metrics.separations)
    rows = [row for row in everything if row.fluent_gap is not None or row.poorly_gap is not None]
    lines = [
        "## The two separations",
        "",
        f"On the weighted 0 to 4 score, with `check-stress.mjs`'s margin of {SEPARATION_MARGIN}: "
        "`fluent-but-wrong` must land clearly below `strong` (or the evaluator is scoring "
        "fluency), and `correct-poorly-explained` clearly above `weak` (or it is scoring "
        "articulacy).",
        "",
    ]
    lines += [
        # Over the rubrics where the gap could be computed, never over every rubric with any score:
        # a pair missing a member has no gap, and counting it in the denominator of "separated"
        # reports it as a pass. The 2026-09-28 opus run printed "11 of 11" on 9 measured rubrics.
        _separation_line("fluency", everything, lambda row: row.fluent_gap),
        _separation_line("articulacy", everything, lambda row: row.poorly_gap),
    ]
    if not rows:
        return lines
    lines += [
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


def _separation_line(
    label: str, rows: Sequence[Separation], gap: Callable[[Separation], float | None]
) -> str:
    """One separation, counted over what could be measured and explicit about what could not."""
    measured = [row for row in rows if gap(row) is not None]
    missing = [row.rubric for row in rows if gap(row) is None]
    if not measured:
        return f"- {label}: **not measured**" + (
            f" — no rubric has both answers ({_named(missing)})" if missing else ""
        )
    separated = [row for row in measured if (gap(row) or 0.0) >= SEPARATION_MARGIN]
    return f"- {label}: **{len(separated)} of {len(measured)}** rubrics separated" + (
        f" — **{len(missing)} not measured** (an answer with no score: {_named(missing)})"
        if missing
        else ""
    )


def _unmeasured_note(rubrics: Sequence[str], why: str) -> str:
    """Name what was not measured, rather than let a denominator quietly absorb it."""
    if not rubrics:
        return ""
    return f" — **{len(rubrics)} not measured** ({why}: {_named(rubrics)})"


def _named(rubrics: Sequence[str]) -> str:
    listed = ", ".join(f"`{rubric}`" for rubric in sorted(rubrics)[:6])
    return listed if len(rubrics) <= 6 else f"{listed} and {len(rubrics) - 6} more"


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


# ---- What the money bought nothing for.

#: What each cause means, in the order a reader would act on it. The three `rejected_*` codes are
#: the gates in `evaluation/service.py`; the rest never reached a gate.
CAUSES: dict[str, str] = {
    "rejected_evidence": "a non-zero criterion whose quote was not in the candidate's own words "
    "(spec §6.2) — the gate the evaluator prompt has most room to prevent",
    "rejected_criteria": "a criterion left out, or one invented that the rubric does not have",
    "rejected_rubric_echo": "the rubric's own wording copied into prose the candidate reads",
    "invalid_output": "output that did not fit the schema at all, so no gate saw it",
    "refusal": "the model declined; never retried (CLAUDE.md, AI provider adapters)",
    "max_tokens": "the reading was cut off mid-criterion",
}


def _rejections(result: RunResult) -> list[str]:
    """Which gate threw a reading away, and what share of the calls each one cost.

    A third of the 2026-09-28 opus run's readings were discarded and the file could only say how
    many, so this section exists to say *which* — one dominant, fixable cause is worth more than the
    model choice it was hiding behind.
    """
    counts = result.call_error_counts
    usage = result.usage
    lines = ["## Why calls bought nothing", ""]
    if not counts:
        if usage.rejected or usage.failed:
            lines.append(
                f"**Not recorded.** {usage.rejected} reading(s) were thrown away and "
                f"{usage.failed} answer(s) went unscored, but this run predates per-call error "
                "codes, so the cause of each is not in the file and cannot be recovered from it."
            )
        else:
            lines.append("Nothing was rejected and nothing failed.")
        return lines
    billed = max(1, usage.calls)
    lines += [
        f"{sum(counts.values())} of {usage.calls} calls came to nothing. Every one of them was "
        "made; a `rejected_*` one was also paid for, because the model answered and code then "
        "refused the answer.",
        "",
        "| cause | calls | share of calls | what it is |",
        "| --- | --: | --: | --- |",
    ]
    lines += [
        f"| `{code}` | {count} | {count / billed:.0%} | {CAUSES.get(code, 'a provider failure')} |"
        for code, count in counts.items()
    ]
    # A merged retry carries a pre-codes run's rejections in the count and not in the table, so the
    # table would otherwise say "7" where 32 readings were thrown away. Attributing part of a total
    # and presenting it as the total is the flaw this section was added to remove, one level down.
    attributed = sum(count for code, count in counts.items() if code.startswith("rejected_"))
    unattributed = usage.rejected - attributed
    if unattributed > 0:
        lines += [
            "",
            f"**{unattributed} further reading(s) were thrown away with no cause recorded** — from "
            "a run written before per-call codes, so which gate refused them cannot be recovered. "
            f"The share column above is over all {usage.calls} calls, so it understates each cause "
            "by as much as those readings would have added.",
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
        "",
        *_compared_rejections(comparison, left, right),
    ]
    return "\n".join(lines) + "\n"


def _compared_rejections(comparison: Comparison, left: RunResult, right: RunResult) -> list[str]:
    """Why each model's calls bought nothing. A cheap model that is rejected twice as often is not
    cheap."""
    left_counts, right_counts = left.call_error_counts, right.call_error_counts
    if not left_counts and not right_counts:
        return []
    causes = sorted(
        set(left_counts) | set(right_counts),
        key=lambda code: -(left_counts.get(code, 0) + right_counts.get(code, 0)),
    )
    return [
        "## Why calls bought nothing",
        "",
        f"| cause | {comparison.left} | {comparison.right} |",
        "| --- | --: | --: |",
        *(
            f"| `{code}` | {left_counts.get(code, 0)} | {right_counts.get(code, 0)} |"
            for code in causes
        ),
        f"| **of calls made** | {left.usage.calls} | {right.usage.calls} |",
    ]


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

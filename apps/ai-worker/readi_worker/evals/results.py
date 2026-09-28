"""The on-disk shape of a run, and how two runs are compared.

A run writes a file and every figure in every report is computed back out of it. That is the whole
design: a paid run happens once, and the model comparison, the fairness table and the cost
arithmetic
all have to be re-derivable from what it stored, weeks later, without paying again. So the file
holds
**per-criterion scores and per-call usage**, not summaries — a summary cannot be re-cut by kind, by
role or against a gold set that does not exist yet.
"""

import json
from collections import Counter
from collections.abc import Iterable
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

from readi_worker.evals.metrics import Agreement, Scored, agreement


class Usage(BaseModel):
    """What a set of calls cost. Three input figures, because they are billed at three rates."""

    calls: int = 0
    #: Calls whose output code threw away (`rejected_*`): paid for, and bought nothing. Counted
    #: separately because it belongs in every cost estimate — one in five of the first paid run's
    #: evaluator calls was a rejected reading.
    rejected: int = 0
    failed: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cache_write_tokens: int = 0
    cache_read_tokens: int = 0
    cost_micro_usd: int = 0
    latency_ms: int = 0

    def plus(self, other: "Usage") -> "Usage":
        return Usage(
            calls=self.calls + other.calls,
            rejected=self.rejected + other.rejected,
            failed=self.failed + other.failed,
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
            cache_write_tokens=self.cache_write_tokens + other.cache_write_tokens,
            cache_read_tokens=self.cache_read_tokens + other.cache_read_tokens,
            cost_micro_usd=self.cost_micro_usd + other.cost_micro_usd,
            latency_ms=self.latency_ms + other.latency_ms,
        )

    @property
    def prompt_tokens(self) -> int:
        """The whole prompt, which no single provider field reports."""
        return self.input_tokens + self.cache_write_tokens + self.cache_read_tokens

    @property
    def cache_hit_rate(self) -> float | None:
        """Share of prompt tokens served from cache. None when nothing was sent at all."""
        total = self.prompt_tokens
        return None if total == 0 else self.cache_read_tokens / total


class CaseResult(BaseModel):
    """One answer, as one model read it."""

    rubric: str
    role: str
    kind: str
    question: str
    #: Per criterion, in the rubric's order. `None` where the answer could not be scored.
    scores: list[int | None]
    expected: list[int]
    #: How many verified quotes each criterion kept. A non-zero score with none would mean spec
    #: §6.2's
    #: evidence rule was not enforced, so the harness counts rather than assumes it.
    evidence: list[int] = Field(default_factory=list)
    error: str | None = None
    confidence: str | None = None
    evidence_flags: list[str] = Field(default_factory=list)
    #: Every call for this answer that failed or was thrown away, in the order the calls were made:
    #: `rejected_criteria`, `rejected_evidence` or `rejected_rubric_echo` for the three gates in
    #: `evaluation/service.py`, `invalid_output` / `refusal` / `max_tokens` for output that never
    #: reached a gate, and the provider's exception name for a call that never happened.
    #:
    #: The **count** was here from the start and the causes were not, which turned out to be the
    #: wrong half: the 2026-09-28 opus run threw away a third of its readings and the file could not
    #: say by which gate, so the one number that might have been a cheap fix was unattributable.
    #: Empty on a run written before this field existed — which is not the same as "nothing failed",
    #: and the report says so when `usage.rejected` disagrees with it.
    call_errors: list[str] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)

    def evidence_violations(self) -> int:
        return sum(
            1
            for score, quotes in zip(self.scores, self.evidence, strict=False)
            if score is not None and score > 0 and quotes == 0
        )


class RunResult(BaseModel):
    """One harness run over one dataset with one model."""

    version: Literal[1] = 1
    label: str
    dataset: str
    #: `ai_draft` or `human`, from the dataset. It decides what the agreement figures mean.
    provenance: str
    provider: str
    model: str
    started_at: str
    finished_at: str
    cache_system: bool
    prompt_versions: dict[str, int] = Field(default_factory=dict)
    #: The file this run's scored answers were carried over from, when it is a `--retry-unscored`:
    #: the answers a previous run could not score, re-scored and merged back into a whole run. Named
    #: rather than inferred, because the cost figures then span two runs and a reader has to be able
    #: to see that.
    retried_from: str | None = None
    #: Every answer this run set out to score, as `rubric/kind`, written before the first call. A
    #: run writes its file after **every** answer now, so a run stopped at a spending cap keeps what
    #: it scored — and this is what lets `--retry-unscored` finish it rather than merely re-run its
    #: failures. Empty on a file written before runs checkpointed.
    planned: list[str] = Field(default_factory=list)
    cases: list[CaseResult] = Field(default_factory=list)

    @property
    def usage(self) -> Usage:
        total = Usage()
        for case in self.cases:
            total = total.plus(case.usage)
        return total

    @property
    def call_error_counts(self) -> dict[str, int]:
        """Why calls bought nothing, commonest first. Empty on a run from before `call_errors`."""
        counts = Counter(code for case in self.cases for code in case.call_errors)
        return dict(counts.most_common())

    def unscored(self) -> tuple[tuple[str, str], ...]:
        """The `(rubric, kind)` of every answer this run has no score for — what a retry re-runs.

        Two kinds, and the second exists only because a run can now be stopped: an answer that was
        scored and failed, and an answer the run **never reached**. A file from a run killed at a
        spending cap holds everything up to that point and nothing after it, so without `planned` a
        retry could not know what was missing and the partial file could never be completed.
        """
        failed = [(case.rubric, case.kind) for case in self.cases if case.error is not None]
        seen = {(case.rubric, case.kind) for case in self.cases}
        never = [key for key in (_split(name) for name in self.planned) if key not in seen]
        return tuple(failed + never)

    def scored(self) -> list[Scored]:
        return [
            Scored(
                rubric=case.rubric,
                role=case.role,
                kind=case.kind,
                scores=tuple(case.scores),
                expected=tuple(case.expected),
                error=case.error,
            )
            for case in self.cases
        ]

    def write(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(self.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return path

    @classmethod
    def read(cls, path: Path) -> "RunResult":
        return cls.model_validate(json.loads(path.read_text(encoding="utf-8")))


class Comparison(BaseModel):
    """Two models on the same sample. `left` is the one a recommendation would be an argument
    for."""

    left: str
    right: str
    #: Answers scored by both. A case only one model managed is excluded and counted, because an
    #: agreement figure computed over different samples is not an agreement figure.
    shared_cases: int
    left_only: int
    right_only: int
    #: Between the two models, per criterion.
    between: Agreement
    #: Each model against the dataset's expectations, over the **shared** cases only.
    left_vs_expected: Agreement
    right_vs_expected: Agreement
    left_mean: float
    right_mean: float


def _split(name: str) -> tuple[str, str]:
    """`"rubric/kind"` back into its halves. Neither a kind nor a slug can contain a slash."""
    rubric, _, kind = name.partition("/")
    return rubric, kind


def merge_retry(previous: RunResult, retry: RunResult, *, source: str) -> RunResult:
    """`previous`, with the answers it could not score replaced by `retry`'s, as one whole run.

    A retried answer keeps **both** attempts' `usage` and both attempts' `call_errors`. The first
    run's calls were made and paid for, and dropping them would make the merged file cheaper than
    the bill — the same rule as `ai_call_log`'s three token columns: a cost that cannot be
    re-derived from its own row is not a measurement (ADR-0007). The answers that scored the first
    time are carried over untouched and in order, so the result is a complete run of the sample and
    can be compared with another model's.
    """
    fresh = {(case.rubric, case.kind): case for case in retry.cases}
    cases: list[CaseResult] = []
    carried: set[tuple[str, str]] = set()
    for case in previous.cases:
        carried.add((case.rubric, case.kind))
        replacement = fresh.get((case.rubric, case.kind))
        if replacement is None or case.error is None:
            cases.append(case)
            continue
        cases.append(
            replacement.model_copy(
                update={
                    # `failed` is the one figure that is not additive: it says "this answer has no
                    # score", one per answer, and a retry that scored it makes the earlier attempt
                    # history rather than a second failure. Left additive it reported 10 unscoreable
                    # answers in a merged run where all 60 had scores. What the failed attempt cost
                    # stays in the token and money columns, and what went wrong with it stays in
                    # `call_errors`.
                    "usage": case.usage.plus(replacement.usage).model_copy(
                        update={"failed": replacement.usage.failed}
                    ),
                    "call_errors": [*case.call_errors, *replacement.call_errors],
                }
            )
        )
    # Answers the previous run never reached at all — a run stopped at a spending cap has them in
    # `planned` and nowhere else, and walking only its `cases` would quietly drop everything the
    # retry had just paid for.
    cases += [case for key, case in fresh.items() if key not in carried]
    order = {name: index for index, name in enumerate(previous.planned)}
    cases.sort(key=lambda case: order.get(f"{case.rubric}/{case.kind}", len(order)))
    return retry.model_copy(
        update={"cases": cases, "retried_from": source, "planned": previous.planned}
    )


def compare(left: RunResult, right: RunResult) -> Comparison:
    """How closely two models read the same answers, and which marks higher."""
    left_cases = {(case.rubric, case.kind): case for case in left.cases if case.error is None}
    right_cases = {(case.rubric, case.kind): case for case in right.cases if case.error is None}
    shared = sorted(set(left_cases) & set(right_cases))
    between: list[tuple[int, int]] = []
    against_left: list[tuple[int, int]] = []
    against_right: list[tuple[int, int]] = []
    for key in shared:
        one, other = left_cases[key], right_cases[key]
        for index, (a, b) in enumerate(zip(one.scores, other.scores, strict=False)):
            if a is None or b is None:
                continue
            between.append((a, b))
            if index < len(one.expected):
                against_left.append((a, one.expected[index]))
                against_right.append((b, other.expected[index]))
    return Comparison(
        left=left.model,
        right=right.model,
        shared_cases=len(shared),
        left_only=len(set(left_cases) - set(right_cases)),
        right_only=len(set(right_cases) - set(left_cases)),
        between=agreement(between),
        left_vs_expected=agreement(against_left),
        right_vs_expected=agreement(against_right),
        left_mean=_mean(value for value, _ in between),
        right_mean=_mean(value for _, value in between),
    )


def _mean(values: Iterable[int]) -> float:
    numbers = list(values)
    return sum(numbers) / len(numbers) if numbers else 0.0

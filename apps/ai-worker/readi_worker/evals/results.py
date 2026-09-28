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
    cases: list[CaseResult] = Field(default_factory=list)

    @property
    def usage(self) -> Usage:
        total = Usage()
        for case in self.cases:
            total = total.plus(case.usage)
        return total

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

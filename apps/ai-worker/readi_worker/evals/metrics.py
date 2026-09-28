"""What a run means, computed from scores alone. Pure, and unit-tested — no I/O, no model, no clock.

Three things are measured, and they are not equally important.

**Fairness** is measured per criterion, because that is where a descriptor lives. A weighted average
can hide a criterion that punished the idiom by three rungs behind two that did not, and the remedy
for
an unfair result is to change *that descriptor* — so the measurement has to name it. The band is one
rung, from `evals/datasets/synthetic/README.md`: "the fifth answer must land within one point of
`strong` on every criterion". It is **one-sided**. `nigerian-english` scoring *above* `strong` is
not a
bias against the candidates this launches for, and treating it as a failure would mean chasing noise
in
the direction nobody is harmed by — it is reported, never failed on.

**The separations** are measured on the weighted score, because they are claims about the answer as
a
whole: confident and wrong must come out below right, and right-but-badly-said above ignorant. The
margin is `check-stress.mjs`'s 0.8 — a fifth of a 0 to 4 scale — so the two read on the same axis.

**Agreement** is measured per criterion against whatever the dataset carries, and
`Dataset.provenance`
decides what it means. Against model-written expectations it is drift detection and nothing else.
"""

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field

from readi_worker.evals.dataset import FAIRNESS_KIND, KINDS, Criterion

#: A clear separation rather than a hair's breadth: a fifth of the 0 to 4 scale. The same constant
#: `check-stress.mjs` holds the rubrics to, so a rubric's own separations and the evaluator's are
#: read
#: on one axis. Changing it here without changing it there makes the two incomparable.
SEPARATION_MARGIN = 0.8

#: How far below `strong` the fairness answer may score on any one criterion.
FAIRNESS_BAND = 1


@dataclass(frozen=True, slots=True)
class Scored:
    """One answer, as the evaluator read it. `scores` is per criterion in the rubric's order."""

    rubric: str
    role: str
    kind: str
    scores: tuple[int | None, ...]
    expected: tuple[int, ...]
    #: Set when the answer could not be scored at all (`EvaluateAnswerResponse.error`). Its criteria
    #: are then `None` and it contributes to no mean — a failure is not a 0.
    error: str | None = None

    @property
    def failed(self) -> bool:
        return self.error is not None or any(score is None for score in self.scores)


def weighted(scores: Sequence[int | None], criteria: Sequence[Criterion]) -> float | None:
    """A rubric's weighted score, 0 to 4. None if any criterion is missing: a partial answer has
    none."""
    if len(scores) != len(criteria) or any(score is None for score in scores):
        return None
    return sum(
        score * criterion.weight / 100
        for score, criterion in zip(scores, criteria, strict=True)
        if score is not None
    )


# ---- Per rubric: the separations and the fairness band.


@dataclass(frozen=True, slots=True)
class Separation:
    """One rubric's five answers, as the evaluator scored them."""

    rubric: str
    role: str
    weighted: dict[str, float | None]
    #: `strong - nigerian-english`, per criterion. Positive means the idiom scored lower.
    fairness_drift: tuple[int | None, ...]
    dimensions: tuple[str, ...]
    missing: tuple[str, ...]

    @property
    def fluent_gap(self) -> float | None:
        return _gap(self.weighted.get("strong"), self.weighted.get("fluent-but-wrong"))

    @property
    def poorly_gap(self) -> float | None:
        return _gap(self.weighted.get("correct-poorly-explained"), self.weighted.get("weak"))

    @property
    def worst_fairness_drift(self) -> int | None:
        drifts = [drift for drift in self.fairness_drift if drift is not None]
        return max(drifts) if drifts else None

    def unfair_criteria(self) -> tuple[tuple[str, int], ...]:
        """The criteria where the idiom cost more than a rung, with the dimension named."""
        return tuple(
            (self.dimensions[index], drift)
            for index, drift in enumerate(self.fairness_drift)
            if drift is not None and drift > FAIRNESS_BAND and index < len(self.dimensions)
        )

    @property
    def problems(self) -> tuple[str, ...]:
        found: list[str] = []
        for dimension, drift in self.unfair_criteria():
            found.append(
                f"{self.rubric} — {dimension}: `{FAIRNESS_KIND}` scored {drift} below `strong`, "
                "so the evaluator is reading the English rather than the engineering"
            )
        if self.fluent_gap is not None and self.fluent_gap < SEPARATION_MARGIN:
            found.append(
                f"{self.rubric}: `fluent-but-wrong` scored "
                f"{_fmt(self.weighted.get('fluent-but-wrong'))} against `strong`'s "
                f"{_fmt(self.weighted.get('strong'))} — the evaluator cannot tell confident and "
                "wrong from right"
            )
        if self.poorly_gap is not None and self.poorly_gap < SEPARATION_MARGIN:
            found.append(
                f"{self.rubric}: `correct-poorly-explained` scored "
                f"{_fmt(self.weighted.get('correct-poorly-explained'))} against `weak`'s "
                f"{_fmt(self.weighted.get('weak'))} — the evaluator is scoring how it was said"
            )
        if self.missing:
            found.append(f"{self.rubric}: no score for {', '.join(self.missing)}")
        return tuple(found)


def separations(scored: Iterable[Scored], criteria: Sequence[Criterion]) -> Separation:
    """The five answers of **one** rubric, judged. `scored` may be short — say so rather than
    guess."""
    rows = {row.kind: row for row in scored}
    if not rows:
        raise ValueError("separations() needs at least one scored answer")
        # Defensive rather than expected: a rubric with no answers never reaches here from `load`.
    any_row = next(iter(rows.values()))
    weights = {kind: weighted(row.scores, criteria) for kind, row in rows.items()}
    strong = rows.get("strong")
    fair = rows.get(FAIRNESS_KIND)
    drift: tuple[int | None, ...] = ()
    if strong is not None and fair is not None:
        drift = tuple(
            None if left is None or right is None else left - right
            for left, right in zip(strong.scores, fair.scores, strict=False)
        )
    return Separation(
        rubric=any_row.rubric,
        role=any_row.role,
        weighted=weights,
        fairness_drift=drift,
        dimensions=tuple(criterion.dimension for criterion in criteria),
        # A kind the run did not reach, or one whose answer could not be scored. Both make a
        # separation unmeasurable, and an unmeasurable separation is reported rather than passed.
        missing=tuple(kind for kind in KINDS if kind not in rows or rows[kind].failed),
    )


# ---- Across a run: agreement, per criterion.


@dataclass(frozen=True, slots=True)
class Agreement:
    """How closely two sets of per-criterion scores match. `n` is criteria, not answers."""

    n: int
    exact: float
    within_one: float
    mae: float
    correlation: float | None
    #: Mean of (left - right). Positive means the left side scores higher: with a model on the left
    #: and a human on the right, a model that marks generously.
    bias: float

    @property
    def empty(self) -> bool:
        return self.n == 0


def agreement(pairs: Iterable[tuple[int, int]]) -> Agreement:
    """Exact match, within one rung, mean absolute error, correlation and direction.

    All four, because each hides something the others show: exact match is brutal on a 5-rung scale,
    within one flatters, MAE says nothing about direction, and correlation is blind to a model that
    is
    uniformly two rungs generous.
    """
    rows = list(pairs)
    n = len(rows)
    if n == 0:
        return Agreement(n=0, exact=0.0, within_one=0.0, mae=0.0, correlation=None, bias=0.0)
    exact = sum(1 for left, right in rows if left == right) / n
    within = sum(1 for left, right in rows if abs(left - right) <= 1) / n
    mae = sum(abs(left - right) for left, right in rows) / n
    bias = sum(left - right for left, right in rows) / n
    return Agreement(
        n=n,
        exact=exact,
        within_one=within,
        mae=mae,
        correlation=_pearson([left for left, _ in rows], [right for _, right in rows]),
        bias=bias,
    )


def _pearson(left: Sequence[int], right: Sequence[int]) -> float | None:
    """None when either side does not vary — a correlation with a constant is undefined, not 0."""
    n = len(left)
    if n < 2:
        return None
    mean_left = sum(left) / n
    mean_right = sum(right) / n
    dl = [value - mean_left for value in left]
    dr = [value - mean_right for value in right]
    denominator = math.sqrt(sum(value * value for value in dl) * sum(value * value for value in dr))
    if denominator == 0:
        return None
    return sum(a * b for a, b in zip(dl, dr, strict=True)) / denominator


# ---- Thresholds, for a dataset a person has scored.


@dataclass(frozen=True, slots=True)
class AgreementThresholds:
    """`evals/thresholds.yaml`. A guess, written down so a calibration round has something to argue
    with.

    It holds only the agreement numbers. The separation margin and the fairness band are **not** in
    that file: they live above, beside the code that applies them, and are the same constants
    `check-stress.mjs` holds the rubrics to. Three copies of `0.8` is how three copies drift.
    """

    enforce_on_provenance: str
    min_exact: float
    min_within_one: float
    max_mae: float
    max_absolute_bias: float

    def applies_to(self, provenance: str) -> bool:
        """Whether a run over this dataset may be failed on agreement at all.

        Against model-written expectations it may not: agreement there measures the drafter agreeing
        with itself, and a threshold on it would fail a run for the wrong reason or pass it for one.
        """
        return provenance == self.enforce_on_provenance

    def problems(self, value: Agreement) -> tuple[str, ...]:
        if value.empty:
            return ("no criterion was scored, so agreement could not be measured",)
        found = []
        if value.exact < self.min_exact:
            found.append(f"exact match {value.exact:.0%} is below {self.min_exact:.0%}")
        if value.within_one < self.min_within_one:
            found.append(
                f"within one rung {value.within_one:.0%} is below {self.min_within_one:.0%}"
            )
        if value.mae > self.max_mae:
            found.append(f"mean absolute error {value.mae:.2f} is above {self.max_mae:.2f}")
        if abs(value.bias) > self.max_absolute_bias:
            found.append(
                f"the model is {abs(value.bias):.2f} rungs "
                f"{'generous' if value.bias > 0 else 'harsh'} on average, past "
                f"{self.max_absolute_bias:.2f}"
            )
        return tuple(found)


# ---- The whole run.


@dataclass(frozen=True, slots=True)
class RunMetrics:
    separations: tuple[Separation, ...]
    #: Against the dataset's own expectations. Means quality only if a person wrote them.
    against_expected: Agreement
    #: Per answer kind, so "the model is two rungs generous on `weak`" is visible rather than
    #: averaged
    #: into nothing. The fairness kind's row is the one to read beside the per-criterion drift.
    by_kind: dict[str, Agreement] = field(default_factory=dict)
    failures: tuple[str, ...] = ()

    @property
    def problems(self) -> tuple[str, ...]:
        """Everything that failed, fairness first — it is the finding that outranks the others."""
        fairness = [
            problem
            for separation in self.separations
            for problem in separation.problems
            if FAIRNESS_KIND in problem
        ]
        rest = [
            problem
            for separation in self.separations
            for problem in separation.problems
            if FAIRNESS_KIND not in problem
        ]
        return tuple(fairness + rest)

    @property
    def unfair(self) -> tuple[Separation, ...]:
        return tuple(row for row in self.separations if row.unfair_criteria())

    def fairness_drifts(self) -> tuple[int, ...]:
        """Every measured per-criterion drift in the run, for the distribution the report prints."""
        return tuple(
            drift for row in self.separations for drift in row.fairness_drift if drift is not None
        )


def run_metrics(
    scored: Sequence[Scored], criteria_by_rubric: Mapping[str, Sequence[Criterion]]
) -> RunMetrics:
    """Everything a run says, from its scores and the rubrics they were scored against."""
    by_rubric: dict[str, list[Scored]] = {}
    for row in scored:
        by_rubric.setdefault(row.rubric, []).append(row)
    rows = tuple(
        separations(group, criteria_by_rubric[rubric]) for rubric, group in by_rubric.items()
    )
    pairs = [
        (score, expected)
        for row in scored
        if not row.failed
        for score, expected in zip(row.scores, row.expected, strict=False)
        if score is not None
    ]
    by_kind = {
        kind: agreement(
            (score, expected)
            for row in scored
            if row.kind == kind and not row.failed
            for score, expected in zip(row.scores, row.expected, strict=False)
            if score is not None
        )
        for kind in KINDS
        if any(row.kind == kind for row in scored)
    }
    return RunMetrics(
        separations=rows,
        against_expected=agreement(pairs),
        by_kind=by_kind,
        failures=tuple(
            f"{row.rubric}/{row.kind}: {row.error or 'no score'}" for row in scored if row.failed
        ),
    )


def _gap(higher: float | None, lower: float | None) -> float | None:
    if higher is None or lower is None:
        return None
    return higher - lower


def _fmt(value: float | None) -> str:
    return "—" if value is None else f"{value:.2f}"

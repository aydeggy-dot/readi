"""A spending cap the run enforces on itself, so nobody has to watch a column.

The owner's standing rule (CLAUDE.md §7.8) is that a paid run spends only what was approved, and
that a run about to pass its figure **stops and asks** rather than finishing and reporting the
overrun afterwards. Until now that was a person reading the per-answer cost as it scrolled: the v3
check of 2026-09-28 was approved at $1.60 and stopped by hand at $1.23. A cap that depends on
somebody watching is a cap that fails the one time the run is left alone.

**The unit is an answer, not a call, and that is the deliberate part.** "Stop before the call that
would cross the cap" sounds tighter and is worse, because an answer is not one call: the evaluator
retries invalid output up to `MAX_ATTEMPTS` times, and the record of what those attempts cost is
assembled once, at the end, out of the response. Aborting between a retry and its parent would
throw away the record of calls that were already made and paid for — and a file cheaper than the
bill is not a measurement (ADR-0007, and the same rule `merge_retry` follows in keeping both
attempts' usage). So the run stops **between** answers, where the books balance.

Which leaves one question: how much might the next answer cost? The estimate is
`MAX_ATTEMPTS times the most expensive call this run has seen`, where a call's cost is taken as an
answer's cost divided by its calls. That figure **dominates every answer the run has already
scored** — an answer costing `calls times mean` can exceed it only by using more than `MAX_ATTEMPTS`
calls, which the evaluator cannot do — so the cap is not crossed by an answer that turns out to be
dearer than its predecessors, which is the one way a per-answer average would be beaten.

The error is therefore on the side of stopping early, which is the right side for a spending cap:
a run stopped short is finished by `--retry-unscored` for the price of what it did not spend, and
a run that overshoots is a conversation about money nobody agreed to.
"""

from readi_worker.evals.results import Usage
from readi_worker.evaluation.calls import MAX_ATTEMPTS

#: What to assume one answer costs before the run has measured its own — used for the first answer
#: only, and deliberately the **dearest** figure anyone has measured: 5.03¢, `claude-opus-5` at the
#: rejection rate of the 2026-09-28 runs. A cap is a promise about the upper bound, so seeding it
#: with a cheaper model's figure would let a small cap be crossed on the very first answer, which is
#: the one the run knows nothing about.
SEED_ANSWER_MICRO_USD = 50_300


class Budget:
    """What has been spent, and whether there is room for another answer."""

    def __init__(self, cap_micro_usd: int) -> None:
        self.cap_micro_usd = cap_micro_usd
        self.spent_micro_usd = 0
        self._answers = 0
        #: The dearest single call seen, as `an answer's cost ÷ its calls`. Per-call costs are not
        #: kept on a `CaseResult` — the file records an answer's usage, which is what every other
        #: figure is computed from — and a mean over one answer's calls is enough for a bound that
        #: is multiplied by `MAX_ATTEMPTS` anyway.
        self._dearest_call_micro_usd = 0

    def record(self, usage: Usage) -> None:
        self._answers += 1
        self.spent_micro_usd += usage.cost_micro_usd
        if usage.calls > 0:
            self._dearest_call_micro_usd = max(
                self._dearest_call_micro_usd, usage.cost_micro_usd // usage.calls
            )

    @property
    def next_answer_micro_usd(self) -> int:
        """What the next answer might cost, at the top of the range this run has seen.

        Before the first answer there is nothing to go on, so it is the seed. Afterwards it is what
        this run has actually measured — including **zero** for a run on the stand-in, which is not
        a gap in the guard but the truth about a run that cannot spend anything.
        """
        if self._answers == 0:
            return SEED_ANSWER_MICRO_USD
        return MAX_ATTEMPTS * self._dearest_call_micro_usd

    def may_start_another(self) -> bool:
        return self.spent_micro_usd + self.next_answer_micro_usd <= self.cap_micro_usd

    def why_it_stopped(self, remaining: int) -> str:
        return (
            f"stopping at the cap: ${self.spent_micro_usd / 1_000_000:.2f} spent of "
            f"${self.cap_micro_usd / 1_000_000:.2f}, and the next answer could cost up to "
            f"${self.next_answer_micro_usd / 1_000_000:.2f}. {remaining} answer(s) not scored — "
            "the file holds what was paid for, and `--retry-unscored` finishes it"
        )

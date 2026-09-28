"""The evaluator's regression and fairness harness (`python -m readi_worker.evals.run`).

It reads rubrics, questions and answer sets from files and needs **no database**: the corpus is
`content/seed` and `evals/datasets`, both of which are the source of truth for what a question says
(CLAUDE.md "Learning content"). That is what makes it runnable in CI, on a laptop and from a
`workflow_dispatch` job without a migrated Postgres anywhere near it.

Three measurements, and the first is the one the product turns on:

1. **Fairness.** `nigerian-english` must land within one point of `strong` on every criterion. Where
   it does not, the evaluator is reading a particular English rather than the engineering, and that
   is
   a bias against the candidates this product launches for (CLAUDE.md product principle 3). It is
   the
   top finding whatever else a run says.
2. **The two separations.** `fluent-but-wrong` clearly below `strong`, and
   `correct-poorly-explained` clearly above `weak`. `check-stress.mjs` already holds every *rubric*
   to
   these on its written scores; this holds the **evaluator** to them on the same answers, so a
   rubric
   that separates and a model that cannot are told apart.
3. **Agreement**, per criterion, against whatever scores the dataset carries — and what that means
   depends entirely on who wrote them. Against `evals/datasets/synthetic` it is a **regression
   baseline**: the scores are model-written, so agreement with them measures nothing about quality
   and
   everything about drift. Against `evals/datasets/gold` it is the real metric, and there is nothing
   in there yet.

`metrics.py` is pure and unit-tested; `run.py` is the only part that spends money.
"""

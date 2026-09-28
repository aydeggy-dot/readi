# The evaluator's harness

```bash
cd apps/ai-worker

# Nothing spent: the stand-in evaluator, two rubrics. This also runs inside `pnpm test`.
uv run python -m readi_worker.evals.run --smoke

# What a paid run would cost, before it is run. Input tokens are counted, not guessed.
uv run python -m readi_worker.evals.run --dry-run --sample 12 --model claude-opus-5

# A paid run. Sequential on purpose — see "Why sequential" below.
ANTHROPIC_API_KEY=… uv run python -m readi_worker.evals.run --sample 12 --model claude-opus-5
ANTHROPIC_API_KEY=… uv run python -m readi_worker.evals.run --sample 12 --model claude-sonnet-5

# Two finished runs, read back off disk and compared. Free, and repeatable for ever.
uv run python -m readi_worker.evals.run --compare \
  ../../evals/results/<run>-claude-opus-5.json ../../evals/results/<run>-claude-sonnet-5.json
```

It reads `content/seed` and `evals/datasets` and needs **no database**, no Redis and no service
token. `readi_worker/evals/__init__.py` is the design; this file is what the numbers mean.

## The three measurements, in the order that matters

### 1. Fairness — and it outranks everything else on the page

`nigerian-english` says the same engineering as `strong`, in the idiom a Nigerian candidate actually
uses. Every criterion where it scores **more than one rung below** `strong` is a descriptor rewarding
a particular English, which is a bias against the candidates this product launches for (CLAUDE.md
product principle 3). A run reports it per criterion, with the dimension named, because that is the
thing you would change; a weighted average would hide one criterion that cost three rungs behind two
that cost nothing.

The band is **one-sided**. The idiom scoring _higher_ than `strong` is noise in the direction nobody
is harmed by: reported, never failed on.

**A pass here is not proof, and must not be quoted as one.** These answers are AI-written — a model's
idea of the idiom, scored by the same family of model — so a pass says the evaluator is fair to _that_.
It is the strongest thing measurable before the pilot, and it is not the claim the product makes. Two
ways it passes and is still wrong: the drafter may have written a milder idiom than candidates actually
use, leaving the descriptors that would punish real speech untested; and a model may read its own
register more charitably than a person's, which no sampling from this set can detect. The fix is real
answers from consented pilot candidates in `datasets/gold/` — the format, the loader and
`--dataset gold` are ready, and the answers are what is missing. Until then, quote the figure as "fair
to model-written Nigerian English".

### 2. The two separations

`fluent-but-wrong` must land clearly below `strong` — otherwise the evaluator is scoring fluency —
and `correct-poorly-explained` clearly above `weak`, otherwise it is scoring articulacy. Measured on
the rubric's weighted 0-to-4 score with the same 0.8 margin
`.claude/skills/question-bank/scripts/check-stress.mjs` uses on the **written** scores, so the two
read on one axis: that script says whether the _rubric_ separates, this says whether the _model_
does, and only both together are worth anything.

### 3. Agreement — and what it does and does not mean

Per criterion, as exact match, within-one-rung, MAE, correlation and bias. All five, because each
hides what the others show: exact match is brutal on a five-rung ladder, within-one flatters, MAE is
blind to direction, correlation is blind to a model that is uniformly two rungs generous.

**Against `datasets/synthetic` this is a regression baseline and nothing more.** Those expected
scores were written by a model (`datasets/synthetic/README.md`). Agreement with them says whether a
fixed answer's score has moved — which is worth knowing, and is the whole reason to keep them — and
says nothing whatever about whether a score is _right_. Only `datasets/gold` can answer that, and it
is empty until experts have scored it.

## Why sequential

Every call sends the same ~1,700-token system prompt, and it is cached
(`readi_worker/evaluation/calls.py`). A cache entry can only be read once the request that wrote it
has answered, so a sequential run pays the 1.25× write once and reads it for every call after. With
`--concurrency 4` the first four calls would each write the same entry at 1.25× and read nothing,
which costs **more** than not caching at all. The flag exists to be left alone.

## What a run leaves behind

`evals/results/<timestamp>-<model>.json` holds every per-criterion score, every quote count and every
call's usage and cost. Every figure in every report is computed back out of it, which is the point: a
paid run happens once, and the model comparison, the fairness table and the cost arithmetic all have
to be re-derivable weeks later without paying again — including against a gold set that does not
exist yet.

Results are committed. They are the evidence behind a model decision, and a recommendation whose
measurements are not in the repository is an assertion.

## Thresholds

`thresholds.yaml` holds the agreement thresholds, which have no code default because they mean
nothing until a person has scored something. The separation margin and the fairness band are **not**
in it: they live in `readi_worker/evals/metrics.py` beside the code that applies them, and are
deliberately the same constants `check-stress.mjs` uses. Three copies of `0.8` is how three copies
drift.

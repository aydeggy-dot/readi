# The strict criteria schema, measured — `rejected_criteria` is gone

**2026-09-28, branch `feat/m4-evaluation`.** The structural fix for `rejected_criteria` was sent to a
real provider for the first time. It works: **0 rejected readings over 30 calls**, against a matched
v2 baseline of **44 over 179 (25%)** on the same six rubrics. Approved at $1.60, spent **99.86¢**.

Run file: `evals/results/20260928T195502Z-claude-opus-5.json`. Two things wording had twice failed to
fix, a schema fixed on the first attempt.

## What was run

```
--sample 6 --seed 7 --model claude-opus-5 --strict-criteria --max-cost 1.60
```

30 answers over the six rubrics the v3 check used, deliberately: it is the sample that holds
`transaction-boundary-reasoning` (the worst offender in the corpus) and `unfamiliar-code-approach`
(whose five answers failed outright in the first run), and it is the only sample with a matched v2
baseline to be read against.

The provider **accepted the schema on the first call**, which was the one thing the run had to settle
before anything else was worth measuring. `anthropic.transform_schema` carries `required: ["0","1","2"]`
and `additionalProperties: false` through intact, exactly as `test_evaluation_strict_schema.py` pins it.

## The result, matched to the same six rubrics

| run | answers | calls | rejected | rate | answers needing a retry | ¢/answer |
| --- | --: | --: | --: | --: | --: | --: |
| `013035Z` opus v2 | 30 | 54 | 6 | 11% | 13/30 | 2.83 |
| `013039Z` opus v2 | 30 | 55 | 16 | 29% | 14/30 | 4.03 |
| `021206Z` opus v2 (merged retry) | 30 | 70 | 22 | 31% | 14/30 | 5.66 |
| **v2 baseline, these six rubrics** | **90** | **179** | **44** | **25%** | **41/90** | **4.17** |
| **strict schema** | **30** | **30** | **0** | **0%** | **0/30** | **3.33** |
| sonnet-5 v2, for reference | 30 | 30 | 0 | 0% | 0/30 | 1.26 |

**One call per answer, thirty times.** Under the 25% per-call baseline the chance of seeing zero
rejections in 30 calls is about 0.02%, and under the 46% per-answer retry rate the chance of no answer
needing a retry is vanishing. This is the direction the v3 check said a run this small could settle,
and it settled it.

## It did not move the scores, which is the other half of the claim

CLAUDE.md requires that a change to the evaluator pass the `/evals` regression. On the 21 answers the
strict run and `013035Z` both scored:

- the two readings agree **89% exact, MAE 0.11, r 0.97, bias +0.02** — the same answers read the same
  way, not a different evaluator wearing the same name;
- against the written expectations, **v2 75% exact / MAE 0.25 and strict 76% / MAE 0.24**. Agreement
  did not drop. (Those expectations are model-written, so this is a regression baseline and not proof
  of quality — `evals/README.md`.)

And on the run's own figures: **fairness 0 of 18 criteria outside the band** (mean drift +0.00, worst
+0), **both separations 6 of 6**, **0 evidence-rule violations** over 183 kept quotes, 0 unscoreable.

The fairness result is the strongest yet recorded — every one of the 18 criteria scored
`nigerian-english` identically to `strong`. It is **not** a new effect of the schema: the three v2 runs
were already clean on these rubrics (worst +0, mean −0.06 to −0.08). It remains fairness to
**model-written** Nigerian English, which is the caveat that travels with the figure everywhere.

## What it costs, and what that changes

**3.33¢ an answer against the 5.03¢ the model decision was taken on — a 34% fall**, which is almost
exactly the "fix `rejected_criteria` and opus's bill drops by about a third" that decision predicted.
A 30-minute session falls from **40.3¢ to 26.6¢**. Against sonnet's 10.1¢ the gap narrows from 4.0× to
2.6×, which does not overturn the choice of opus — that rested on agreement, not price — but it is the
first of the two things the decision named as able to change the answer. The other, a gold set, is
still missing.

Cache behaviour is unchanged and healthy: one write, 29 reads, **67% of prompt tokens served from
cache**.

## Three honest limits

- **All six rubrics are `backend`.** The other six of `--sample 12 --seed 7` are four `frontend` and
  two `qa`, so scoring those closes the role gap; that run is priced at ≈$1.00.
- **Every rubric has exactly three criteria — and that is not a gap in the sample.**
  `check-bank.mjs` permits 3–5, so this was first written down here as "a five-criterion rubric has
  never been sent to a real provider, and the full 12-rubric run is where it would be seen". **That
  was wrong**, and counting said so: all **102** rubrics in `evals/datasets/synthetic` have three
  criteria, and so do all **102** in `content/seed` — 29 backend, 30 frontend, 33 qa, 10 shared.
  No run over this corpus can exercise a wider rubric because none exists, and no candidate can meet
  one either. The schema is therefore measured at exactly the width every rubric in the product uses;
  what is untested is a rubric nobody has written yet, and the first 4- or 5-criterion rubric is what
  should be measured against it, not a bigger sample.
- **Some of what v2 left unscored was a billing outage, not the evaluator.** Two v2 runs left 9 of 30
  answers on these rubrics with no score, but most are `provider_error` from the credit exhaustion of
  the overlapping-runs incident. The honest count of answers v2 **gave up on** after spending its
  retries is **3** (`invalid_output`, all in `013039Z`); the strict run gave up on none. The rejection
  rate, not this, is the decisive figure.
- **The schema forbids the failure; it does not teach the model the rubric.** What is now impossible is
  omitting or inventing a criterion. Whether the score it is forced to give a criterion the answer did
  not reach is the right one — a 0 with no evidence, per spec §6.2 — is a question for the gold set,
  not for this run. The agreement figures say it did not get worse.

## The decision this leaves

`EVALUATOR_STRICT_CRITERIA_SCHEMA` is still **off by default**. Turning it on is a change to the
evaluator in front of candidates, so it is the owner's, and the evidence for it is: the rejection rate
gone, the scores unmoved, fairness and both separations unchanged, and a third off the bill.

**The owner's decision, 2026-09-28: complete the evidence first.** The other six rubrics of
`--sample 12 --seed 7` — four `frontend`, two `qa` — are to be scored with the schema on before the
default changes, so that strict has been measured over the same twelve as the earlier non-strict runs.
Priced at **≈$1.00** (30 answers at the 3.33¢ this run measured), cap **$1.20**. `--rubric` was added
to the harness for it: the complement of a sample cannot be expressed as a sample.

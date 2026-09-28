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

---

# The second run, and the switch

**Ran at 20:17, `evals/results/20260928T201710Z-claude-opus-5.json`, $1.04 of a $1.20 cap.** Also
**0 rejected readings over 30 calls**, 0 unscoreable, both separations **6 of 6**, fairness **0 of 18
criteria outside the band**, 80% exact against the expectations.

## Both runs, against the same twelve rubrics the non-strict runs used

| | answers | calls | rejected | rate | retried | unscored | cost | ¢/answer |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| v2 baseline (three opus runs) | 180 | 297 | 74 | **25%** | 58/180 | 20/180 | $7.64 | 4.24 |
| **strict, both runs** | 60 | 60 | **0** | **0%** | **0/60** | **0/60** | $2.04 | **3.40** |
| sonnet-5 v2, reference | 60 | 60 | 0 | 0% | 0/60 | 0/60 | $0.75 | 1.26 |

Under the baseline per-call rate, the chance of 0 rejections in 60 calls is **3 × 10⁻⁸**. One call per
answer, sixty times.

**Cost per session: 13.6¢ at 15 minutes, 27.2¢ at 30**, from 3.40¢ an answer measured over all 60.
(The first run alone read 13.3¢ / 26.6¢; the second is slightly dearer, and the combined figure is the
one to quote.) Against the 40.3¢ the model decision was taken on, a 30-minute session is now **two
thirds of what it was**, and the gap to sonnet narrows from 4.0× to 2.7×.

## One finding that is not clean, and what it is worth

`EVALUATOR_STRICT_CRITERIA_SCHEMA` is **on by default** as of this run. But the agreement figures are
not identical to v2's, and on one of the two rubric sets the difference is **larger than the
evaluator's own run-to-run noise**. The noise floor is measurable because two v2 runs scored the same
sample with the same configuration:

| | noise floor (v2 vs v2) | strict vs v2 | v2 vs expected | strict vs expected |
| --- | --: | --: | --: | --: |
| six `backend` rubrics | 93% / 0.07 | **92% / 0.08** | 80% / 0.20 | **81% / 0.19** |
| six `frontend`+`qa` rubrics | 88% / 0.12 | **80% / 0.20** | 89% / 0.11 | **80% / 0.20** |

On the backend six, strict is indistinguishable from a repeat run. On the frontend and qa six it is
not: it agrees with the expectations 9 points less than v2 did on the same answers, and it disagrees
with v2 by more than v2 disagrees with itself. The drop is **spread across all five answer kinds**
(`weak` −17, `correct-poorly-explained` −11, the rest −6) rather than concentrated, and **every
disagreement is within one rung** — 100% within one, in every comparison in that table. Mean criterion
score moved −0.02.

Fairness moved in the same direction and stayed inside the band: on the frontend and qa six, v2's
`strong` minus `nigerian-english` drift was −0.06 to −0.13 and strict's is **+0.17**, with 3 of 18
criteria one rung below `strong` where v2 had one or none. Still 0 of 18 outside the band, and v2 runs
on those rubrics already had a worst of +1, so a one-rung criterion is not new there.

**How much this is worth knowing, honestly.** The expectations are model-written, and
`evals/README.md` says agreement with them is a regression baseline and nothing about whether a score
is right. CLAUDE.md's rule is that agreement with **human** scores must not drop, and there are no
human scores — `evals/datasets/gold` is empty. So nothing measurable today says the strict evaluator is
worse; what is measurable says it reads six of the twelve rubrics slightly differently, by one rung on
about 8 criteria in 90 more than a repeat run would.

**What would settle it, and it is cheap: one repeat strict run on the same frontend and qa six,
≈$1.04.** Two strict runs on one sample give the strict noise floor, which is the only thing that
separates "the schema reads these rubrics differently" from "this run read these rubrics differently".
Until that exists, the switch rests on the two measurements that do mean something today — fairness
inside the band on all 36 criteria and both separations 12 of 12 — plus the rejection rate it was
built for. Reverting is one line in `settings.py`.

## What was not decided

**Nothing records, per stored evaluation, which schema scored it.** `answer_evaluations` keeps the
provider, the evaluator model, `prompt_versions` and `SCORING_VERSION`; the schema shape is none of
those. It changes what can be rejected and what a call costs, not the score's meaning, so a column
would be an operational detail rather than a part of the artefact — and the deployment's configuration
plus the date answers it. Left alone deliberately; worth revisiting if the flag is ever toggled in
production, because then the date stops answering it.

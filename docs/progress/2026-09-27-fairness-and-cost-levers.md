# The fairness fix, the reserve, and what caching would save

**2026-09-27, M4 phase 4.6, branch `feat/m4-evaluation`.** Two of the four findings of the first paid
evaluation run (`2026-09-27-m4-first-paid-evaluation.md`) acted on, and the third measured rather
than guessed. The owner's decision was to implement **both** remedies for finding 1, in this order:
the guarantee first, the improvement second.

---

## 1. A criterion nobody asked about is not assessed

**`SCORING_VERSION` is 2.** A criterion whose planned follow-up was never asked, and which the
candidate did not cover anyway, leaves the score's denominator entirely — it is not scored 0 — and
the report names it.

### The rule, and why it takes two facts from two places

```
not assessed  =  the interview never asked about it        (the engine's record)
              ∧  the answer did not reach it anyway        (the model's own reading)
```

- **"Never asked"** is `unaskedCriteria()` in `apps/api/src/evaluations/prompting.ts`: the criterion
  carries at least one probe, and no interviewer turn named any of them. It is the exact complement
  of `promptedCriteria()` over the criteria that have probes, which is what makes it safe to reason
  about — **prompted ∪ unasked = every criterion with a probe**, and a criterion with no probe is in
  neither, because the opening prompt is what asks that one. Per probe, never per criterion: a
  criterion with two probes of which one was asked is *prompted*, not unasked.
- **"Did not reach it"** is the evaluator's 0 with no evidence, which the contract already defines as
  "the criterion was never addressed at all" (spec §6.2). Two cases are therefore **still scored**,
  and they are the two that matter:
  - the candidate **volunteered** it without being asked — that is the skill the whole report is
    about, and it scores at full weight because no probe was asked and there is no nudge to discount;
  - the candidate addressed it squarely and was **wrong** — recognisable by the quote, because the
    evaluator is told to quote the sentence where they were wrong. Excluding that would delete the
    most useful mark on the page.

`notAssessedCriteria()` in `scoring.ts` is where the two meet. **It never excludes the whole rubric**:
two of the 104 seeded questions (`pushing-back-on-a-release`, `selenium-stale-element`) carry a probe
for every criterion, so the case is reachable — and the answer it is reachable with addressed nothing
at all, which is a 0 the candidate earned on the thing the prompt did ask.

**Any reason counts**, which is why the rule is written as "nobody asked" rather than "the clock ran
out": the deadline, the candidate ending early, and the follow-up cap spent on another criterion all
produce the same shape, and the candidate cannot tell them apart. That is also how the integration
test provokes it (`FakeInterviewEngine.followUps`).

### What moves, and what deliberately does not

| | before | after |
|---|---|---|
| `answer_evaluations.criteria` | the model's reading, untouched | unchanged |
| `answer_evaluations.overall_raw` | the pinned weights over the **whole** rubric | unchanged — `/evals` compares a human to the model, not to our arithmetic |
| `answer_evaluations.overall` | 0.85 on prompted criteria | **and** the not-assessed exclusion |
| `not_assessed_criteria` | — | new column, stored rather than recomputed |

The column is stored for the reason `prompted_criteria` is: `overall` was computed against *that*
list under the `scoring_version` beside it, and a report that recomputed the set under a later rule
would name criteria the number never came from.

### The report has to admit it

`CandidateQuestionReport.not_assessed` carries those criteria by `dimension`, and a criterion is in
**exactly one** of `criteria` and that list, so the page cannot say both. The web renders it in its
own frame after the criteria, with the reason:

> **Not scored on this** — We did not get to ask you about one of the points this question covers, so
> it is not part of the score above: *Deals with the rows that are already wrong.*
> *An interview has a clock, and it cannot put every point to you. What we did not ask, we do not
> score.*

`CandidatePrompting.criteria_total` is now the **assessed** count, so the volunteered sentence reads
"you covered 1 of 1 before being asked" and never "1 of 2" about a question that was never put.

### The evaluator is told, and it may not move a score

`EvaluationCriterion.asked_about` is the one engine fact that crosses to the model, marked in the
criteria block as `NOT ASKED: the interview did not get to put this to the candidate.` and explained
in **`evaluate_answer.v2.md`** (v1 is released and scored the paid run, so it was not edited).

The line it draws: *"volunteered or prompted"* stays hidden because it is a **grading** fact and the
model would be scoring the interview; *"asked at all"* does not, because the evaluator's prose is
printed in the candidate's report and a model that does not know the interview ran out of time writes
"you did not mention how you would repair the rows" — which reads as a criticism for something nobody
asked. So v2 says: score it exactly as the answer merits, **do not compensate**, and do not tell the
candidate they failed to say something they were never asked (out of `missing_points`, not an
`improvement_tip`, not a `red_flag`).

### The real question 4, scored again

The owner asked for the fix to be tested on the real transcript. It is, in
`scoring.spec.ts` ("the first paid run's question 4"), from that run's own `answer_evaluations` row:

| criterion | weight | score | quotes | probe | asked? |
|---|---|---|---|---|---|
| 0 · Sees the gap between the two writes | 25 | 4/4 | 2 | none (the prompt asks it) | yes |
| 1 · Puts a boundary in the right place | 40 | 3/4 | 3 | yes | **no** — but covered anyway |
| 2 · Deals with the rows that are already wrong | 35 | **0/4** | **0** | yes | **no** |

- **Before:** `(1.00 × 25 + 0.75 × 40 + 0 × 35) / 100` = **55**.
- **After:** criterion 1 was unasked but scored 3, so it stays at full weight; only criterion 2 leaves.
  `(1.00 × 25 + 0.75 × 40) / 65` = **85**. `overall_raw` is still 55.

The session's overall goes from **73** to **81**. The 30 points the clock took are given back, and
the report says which point was not asked.

### Two consequences for reports that already exist

**Every stored report is unreadable to this release, and that is the designed path.** `not_assessed`
is a required field, so `SessionReportResponse.safeParse` fails on any `session_reports.summary`
written before today — which is precisely what `safeParse` plus the sweep exist for: the route answers
`report_not_ready`, queues the job, and re-assembly **makes no model call**, because every answer
already has a row. The candidate sees the processing screen once. It was deliberately not given a Zod
`.default([])`: the contract reads better required, and the recovery costs nothing.

**But an already-scored session does not get the 30 points back.** An answer with a row is never
re-scored, and re-assembly reads the stored `not_assessed_criteria`, which is empty for rows written
under `scoring_version = 1`. So the paid run's report re-assembles at 55 and 73. Re-scoring means
deleting that session's `answer_evaluations` rows and paying again — an operator's call, and there is
exactly one real session it would apply to.

---

## 2. Do not open a question the clock cannot probe

`SECONDS_TO_OPEN_A_QUESTION = SECONDS_FOR_A_QUESTION + SECONDS_FOR_A_FOLLOW_UP` (165 s), used by
`_past_current_question`. The paid run opened its fourth question with **127 seconds** left — past the
old 120-second reserve by seven — and `budgets.py`'s own comment admitted what that bought: "enough
for the answer, if not for the probing".

With the scoring fix in place this is no longer what makes the interview *fair*; it is what makes it
*whole*. A question whose probes cannot be asked is a question the candidate is asked once and scored
on one criterion of, and three proper questions plus their own questions at the end is a better
interview. On the run's own numbers the fourth question would not have opened, and the 127 seconds
would have gone to the candidate's questions (which need 90) instead of being skipped with 25 left.

`test_a_question_is_only_opened_if_a_probe_could_follow_it` is parameterised on 127 seconds by name.

**Not changed:** the first question still opens on `out_of_time` alone — a session with no question at
all is not an interview. And `SECONDS_FOR_CANDIDATE_QUESTIONS` is untouched; whether the 15-minute
plan is four questions or three is finding 3 and still waits on `interviews:pace`.

---

## 3. Prompt caching for the evaluator — measured, not guessed

The handover guessed "~1,500 shared tokens of ~4,350, around 10%". **Measured: it is the system
prompt, ~1,700 tokens of a 4,352-token average call, and the saving is 12% cold and 16% warm.**

### What is actually shareable

The request is `system` (a string) + one user message, with structured output through
`output_config.format`. Render order is `tools → system → messages`, so the cacheable prefix is the
**system prompt and nothing else** — the user message diverges at its first interpolation (the
question), two lines in.

Measured by rendering the real prompts against the real question
(`db-half-finished-transfer`, the paid run's question 4):

| | chars | shared? |
|---|---|---|
| `evaluate_answer.v2.md` (system) | 6,281 | **yes, every call of every session** |
| the output schema | 873 | yes (constant, and not a cache-invalidator either way) |
| the rubric block | 2,236 | no — per question |
| the ideal points | 537 | no |
| the transcript | varies (1,250 in this reconstruction; the real run's were far longer) | no |

At ~3.7 chars/token that is **≈1,700 tokens** shared. The per-call average from the run is 4,352
input tokens, so the prefix is **~39% of the input** — and input was 10.88¢ of the 23.38¢ bill, with
output the other 12.50¢. (That split reconciles exactly: 21,760 × 5 + 4,999 × 25 µUSD = 23.38¢.)

### The arithmetic

Cache writes cost 1.25× the input rate at the 5-minute TTL, reads 0.1×. Minimum cacheable prefix is
**512 tokens on opus-5** and **1,024 on sonnet-5** — both cleared comfortably, which matters because
phase 7 may switch models.

| 15-minute session, 5 evaluator calls | opus-5 | sonnet-5 |
|---|---|---|
| the run as it happened | 23.38¢ | 9.35¢ (projected) |
| the shared prefix, paid five times | 4.25¢ | 1.70¢ |
| cached **cold** — one write, four reads | 1.40¢ | 0.56¢ |
| cached **warm** — five reads | 0.42¢ | 0.17¢ |
| **saving, cold** | **2.84¢ (12.2%)** | 1.14¢ (12.2%) |
| **saving, warm** | **3.82¢ (16.3%)** | 1.53¢ (16.3%) |

Sensitivity on the one estimated input: 3.5 chars/token → 12.9%, 3.7 → 12.2%, 4.0 → 11.2%. The band
is narrow enough that the decision does not turn on it. An exact figure is one free
`messages.count_tokens` call away, which needs the key.

### The two things that decide whether it is worth building

**The prefix is global, not per-session.** The system prompt is the same for every answer of every
session, so the cache entry is shared across candidates. Under continuous traffic — any two sessions
starting within five minutes of each other — the write is amortised to nothing and every call is a
read: that is the **warm** row, 16%. Cold is the one-session-at-a-time case, 12%. So the honest range
is **12–16% of the evaluation bill**, and it improves with volume rather than degrading.

**The fan-out defeats it as it stands.** `EVALUATION_CONCURRENCY = 4` starts all four calls together,
so on a cold prefix all four miss a cache none of them has written. Two ways out, and the second is
better:

1. Score the first answer alone, then fan out. Costs one call's latency — **~15 s** measured
   (14,990 ms average) — against spec §8's 60 s. A 30-minute session becomes 15 + 2 waves × 15 = 45 s
   where it is 30 s now. Inside the budget, but it spends a quarter of it.
2. **Pre-warm with `max_tokens: 0`** before the fan-out. One cache write in a request that generates
   nothing, so it costs the same 1.09¢ of write and about a second instead of fifteen. Strictly
   better than (1) on latency and within a rounding error on cost.

A **scheduled** keep-alive (re-reading the prefix every five minutes to refresh its timer) is *not*
worth it at MVP volume: a refresh costs a cache read, ~0.09¢, which is ~$7.50/month — break-even is
about nine sessions a day. Revisit it when volume passes that, at which point the warm row becomes
the normal case for free.

### Where it sits among the levers

| lever | saving on a 15-minute session's 23.38¢ | costs |
|---|---|---|
| **sonnet-5 instead of opus-5** | ≈14.0¢ (**60%**) — 2/10 µUSD per token against 5/25 | agreement with human scorers, which is `/evals`' question and not taste |
| **prompt caching** | 2.84–3.82¢ (**12–16%**) | one pre-warm call, and the fan-out reshaped |
| both together | ≈15.5¢ (**66%**), to ≈7.9¢ | both of the above |
| the retry | 4.7¢ of this run bought nothing — one of five calls was a rejected reading | nothing to fix; that is the gates working, and it belongs in every estimate |

**They compose**, and caching's percentage is the same on either model, so the order is: decide the
model on agreement in phase 5/7, then add caching regardless of the answer.

### Inputs to M8 pricing

Per 15-minute session, all-in (interview + evaluation), at the measured rates:

| | interview | evaluation | total |
|---|---|---|---|
| as it ran (sonnet-5 / opus-5) | 4.79¢ | 23.38¢ | **28.17¢** |
| + caching on the evaluator | 4.79¢ | 19.6–20.5¢ | **24.4–25.3¢** |
| evaluation on sonnet-5 | 4.79¢ | 9.4¢ | **14.2¢** |
| sonnet-5 + caching | 4.79¢ | 7.8–8.2¢ | **12.6–13.0¢** |

A 30-minute session is eight answers, so roughly double the evaluation: **≈50¢ on opus, ≈20¢ on
sonnet, ≈16–17¢ on sonnet with caching.** The interview scales with turns rather than questions, so
4.79¢ is a floor there rather than a proportion.

One measurement not taken, and the larger caching opportunity: **the interview's own calls share more
than the evaluator's.** Fourteen calls in that session, all against the same system prompt *and* the
same session bundle, which is a per-session prefix worth far more than a per-call one. It is only
4.79¢ to save 12–16% of, so it is not urgent — but it is the same mechanism and it would need no
pre-warm at all, because the interview is sequential by construction.

---

## What is verified

- `pnpm lint`, `pnpm typecheck` clean. 584 API tests, 349 worker tests, 168 web tests — all green,
  including the integration test that runs the fairness case end to end through the real queue.
- The scoring rule is unit-tested on the real question 4's own numbers, in both directions: 55 under
  the old rule, 85 under the new one.
- `evaluate_answer.v2.md` added rather than v1 edited; `PROMPT_VERSIONS` bumped for that one prompt
  only. `prisma migrate dev --create-only` proposed `DROP INDEX questions_embedding_hnsw` for the
  **tenth** time and it was deleted; applied with `migrate deploy`.
- Not run: `pnpm test:e2e` (the owner's dev servers are up, and a build would write `apps/web/.next`).
  The e2e path is reachable — the stand-in evaluator now scores a `NOT ASKED` criterion 0 with no
  evidence, so a report for an interview that ran out of time shows the honest state.

## What is still open from the paid run

- **Finding 3** — whether the 15-minute plan is four questions or three. `interviews:pace` (phase 7)
  before anything changes. The reserve above reduces the harm either way.
- **Finding 4, the consent-routing fix** — reported done, but `nextOnboardingPath` in
  `apps/web/src/lib/navigation.ts` still routes on `completed_at`, and the working tree is clean. It
  still gates phase 6.

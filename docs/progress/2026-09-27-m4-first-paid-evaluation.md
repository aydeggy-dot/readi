# The first paid evaluation run — what it cost, and the four things it found

**2026-09-27, M4 phase 4.5, branch `feat/m4-evaluation`.** Session
`742150d9-32f6-4147-8282-7a54b93164a9`, `aydeggy5@gmail.com`, Backend · Mid-level, 15 minutes,
`anthropic/claude-sonnet-5` for the interview and `anthropic/claude-opus-5` for the evaluation.
18:07:05 → 18:21:43 UTC, 18 turns, `completed`, `end_reason: questions_done`. Tracing off (no
Langfuse keys), so every `langfuse_trace_id` is null.

**The evaluator met a real model for the first time, and it worked.** Four answers scored, all
`high` confidence, one retry on a gate, no refusals, no provider errors, no evidence flags. The
report rendered with real quotes from the candidate's own answers. What follows is what it cost and
the four things worth acting on.

## What it cost

**28.17¢ total: 4.79¢ of interview and 23.38¢ of evaluation.**

| stage | purpose | calls | input | output | µUSD | cents | avg ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| interview (`claude-sonnet-5`) | `interviewer` | 5 | 6,310 | 345 | 16,070 | 1.61 | 3,318 |
| | `coverage` | 4 | 6,039 | 361 | 15,688 | 1.57 | 3,273 |
| | `follow_up` | 5 | 7,085 | 201 | 16,180 | 1.62 | 2,362 |
| | **subtotal** | **14** | **19,434** | **907** | **47,938** | **4.79** | 2,964 |
| evaluation (`claude-opus-5`) | `evaluator` | 5 | 21,760 | 4,999 | 233,775 | 23.38 | 14,990 |
| | **total** | **19** | **41,194** | **5,906** | **281,713** | **28.17** | |

Five evaluator calls for four answers: question 3's first output was rejected by the
`rejected_criteria` gate and retried. Five `follow_up` calls for four follow-ups: one
`rejected_added_ask`, the guard doing its job. Both rejections are `status = ok` rows with an
`error_code`, because the call succeeded and cost money — what failed was our check on its output.

## The per-answer table

| # | question | raw | final | prompted | confidence | attempts | flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `email-in-the-request` | 83 | **75** | criteria 1, 2 | high | 1 | 0 |
| 2 | `what-happens-when-it-is-down` | 85 | **82** | criterion 1 | high | 1 | 0 |
| 3 | `the-part-you-did-not-write` | 84 | **80** | criterion 2 | high | 2 | 0 |
| 4 | `db-half-finished-transfer` | 55 | **55** | — | high | 1 | 0 |

The prompting adjustment behaves: two criteria discounted costs 8 points on question 1, one costs 3
on question 2 and 4 on question 3, and question 4 — where nothing was prompted — has raw and final
identical. Session overall **73**.

---

## 1. Question 4 was scored on a criterion nothing ever asked about

The owner's suspicion on reading the report was that question 4's 55 was unfair: the answer covered
the cause and the fix but not repairing the rows that were already wrong, and no follow-up ever
asked. **The engine log confirms it exactly.**

`session_turns.criteria_covered` for that answer:

```
criterion 0: not_judged, has_probe=false, follow_up_index=null
criterion 1: not_judged, has_probe=true,  follow_up_index=null
criterion 2: not_judged, has_probe=true,  follow_up_index=null
```

`not_judged` for all three because **no coverage call was made at all** — the `ai_call_log` goes
straight from the `interviewer` call that asked question 4 (18:20:01) to the one that spoke the close
(18:21:43). Two probes existed, in play, and neither was asked.

And this is where the 55 came from:

| criterion | weight | score | quotes |
| --- | --- | --- | --- |
| 0 · Sees the gap between the two writes | 25 | 4/4 | 2 |
| 1 · Puts a boundary in the right place | 40 | 3/4 | 3 |
| 2 · Deals with the rows that are already wrong | 35 | **0/4** | **0** |

`(1.00 × 25) + (0.75 × 40) + (0 × 35) = 55`. **The entire difference between 55 and 90 is one
criterion whose probe existed, was never asked, and earned no discount.**

### The mechanism, which is three correct rules composing into a wrong outcome

- The engine opened question 4 at 12:53 with **127 seconds** left, clearing
  `SECONDS_FOR_A_QUESTION = 120` by seven seconds.
- The answer took 99 seconds. At submission **25 seconds** remained, under
  `SECONDS_FOR_A_FOLLOW_UP = 45`, so `machine.probes_to_judge` returned empty — correctly, by its own
  docstring: "the deadline leaves no room for a follow-up, so the engine is moving on regardless".
  No coverage call, no follow-up, and the turn logged honestly as `not_judged`.
- The evaluator then scored **all three criteria**, because `evaluationRequest()` sends the whole
  pinned rubric and the evaluator has no idea which probes the engine managed to ask.

`budgets.py` says 120 seconds is "roughly *enough for the answer, if not for the probing*" — it
knowingly admits a question it may not be able to probe. What it did not anticipate is that **nothing
downstream knows the probing never happened.** The 0.85 adjustment protects a candidate who *needed*
a nudge; there is nothing at all for a candidate who was never *offered* one.

### Two remedies, and they are not exclusive — the owner's call

1. **Do not open a question the clock cannot probe.** Raise the reserve to
   `SECONDS_FOR_A_QUESTION + SECONDS_FOR_A_FOLLOW_UP` (165 s), so a question is only started if at
   least one probe could follow it. Simple, one constant, and it makes the reserve mean what its
   comment says. It costs a question in sessions like this one — which may be the right answer
   anyway, see §4.
2. **Tell the scoring that a probe was unreachable.** A criterion whose probe was never asked and
   whose answer did not cover it is a criterion the interview failed to ask about, not one the
   candidate failed. Excluding it from the denominator is the mirror image of the prompting discount
   and uses the same engine fact (`criteria_covered`, `follow_up_index`). More correct, more work,
   and it needs a decision about what the report then *says* — a question scored on two of three
   criteria has to admit that on the page.

Until one of them lands, **a candidate can lose 35 points to the clock**, and neither the report nor
the transcript explains why.

---

## 2. The evaluation is 83% of the bill

23.38¢ of 28.17¢, and **4.9× the interview it scored**. The M4 plan projected ≈12¢ for four answers on
opus; the real figure is nearly double, on ~4,350 input and ~1,000 output tokens per call plus one
retry. At this rate a 30-minute session (eight answers) is roughly **50¢ of evaluation** — which is
the number Naira pricing has to survive, and it is the whole of decision 7's "phase 7 owes an explicit
sonnet-5 vs opus-5 comparison with a recommendation".

Three levers, in the order they are worth pulling:

- **The model.** sonnet-5 is 2.5× cheaper on both sides (2/10 µUSD per token against 5/25). The same
  five calls on sonnet would have been ≈9.4¢, taking the session to ≈14¢. Whether it agrees with human
  scorers well enough is `/evals`' question, not taste — phase 5 then phase 7.
- **Prompt caching for the evaluator.** The four answers are scored within **17 seconds of each
  other**, well inside any cache window, and every call shares the same system prompt and evaluator
  instructions; the rubric and the exchange are the per-answer part. **The split has not been
  measured**, so the saving is unknown — but on a guess of ~1,500 shared tokens of the ~4,350, four
  cached reads would save roughly 2–3¢ of 23.38¢, around 10%. Worth measuring before building.
  **One design note that matters:** the API fans out with `EVALUATION_CONCURRENCY = 4`, so all four
  calls start together and would all *miss* a cache none of them has written yet. Caching only pays
  if the first answer is scored alone and the rest follow — which trades a little latency against the
  60-second budget in spec §8. Measure both.
- **The retry.** One of five calls was a rejected output, so ~20% of the spend bought nothing. That is
  the gates working rather than waste, but it is a real 4.7¢ and it belongs in any per-session
  estimate.

---

## 3. `transcript_review` is never asked of an account that finished onboarding

The intro did not carry the v3 clause. It was right not to: there is **no `transcript_review` record
of either kind** for this account — four consent rows from 2026-09-19 and nothing since — so
`hasGranted` returned false and the conditional omitted the sentence. `prompt_versions` confirms
`interview_intro: 3` rendered.

So everything downstream of the decision works. **The decision is never requested**, and phase 0's
claim that "it joins `allDecided`, so every existing account is asked once" is untrue in practice.

The cause is one line, in `apps/web/src/lib/navigation.ts`:

```ts
export function nextOnboardingPath(state: OnboardingState): string | null {
  if (!state.profile_completed) return "/onboarding/profile";
  if (!state.completed_at) return "/onboarding/consent";   // ← set on 2026-09-19
  return null;
}
```

`ConsentsService.allDecided` is correct, `OnboardingService.state` does return
`consents_completed: false`, and `complete()` refuses on it — but nothing routes an account that has
**already** completed onboarding back to the consent screen for a consent type that did not exist
when it onboarded.

**The proposed fix is one line:**

```ts
if (!state.consents_completed) return "/onboarding/consent";
```

which also makes a future `CONSENT_VERSIONS` bump re-ask, exactly as ADR-0017 intends. It was not
applied in this session because it changes routing for every signed-in user and wants two checks
first: that `/onboarding/consent` cannot redirect-loop on an account whose `completed_at` is set, and
what its Continue button does when `complete()` is already satisfied. The regression test is
`nextOnboardingPath` with `completed_at` set and `consents_completed` false, which must not be null.

**It gates phase 6.** The calibration sampler draws through `usersGranting("transcript_review")`,
which is correct and currently returns nobody — so the tool would be built against an empty set and
look like it worked.

---

## 4. Four questions did not fit fifteen minutes at this candidate's pace

The session used 14m 38s of its 15m and ended on `questions_done` — the *count* ran out first, and the
candidate's own questions were then skipped because 25 seconds remained against
`SECONDS_FOR_CANDIDATE_QUESTIONS = 90`. That part is the engine working as designed, and the intro
promises four questions and follow-ups without promising the invitation, so no promise was broken.

| question | span | follow-ups | candidate typing |
| --- | --- | --- | --- |
| 1 `email-in-the-request` | **9m 12s** | 2 (the cap) | 236 s + 72 s + 224 s |
| 2 `what-happens-when-it-is-down` | 1m 38s | 1 | 47 s + 42 s |
| 3 `the-part-you-did-not-write` | 2m 00s | 1 | 79 s + 32 s |
| 4 `db-half-finished-transfer` | 1m 42s | 0 | 99 s |
| close | spoken at 14:35 | | |

**95% of the session was the candidate typing** — 13m 51s of 14m 38s. The model spent 43 seconds in
total across nine spoken turns. **Question 1 alone took 63% of the interview**, on a 236-second first
answer and a 224-second answer to its second probe.

So the open question is not the 90-second reserve; it is whether a 15-minute plan is honestly four
questions. One data point is not a pace, which is precisely what `interviews:pace` is for (phase 7) —
median and p90 candidate-turn seconds, with the sample size on its face. Until it reports, the
options are on the table and none should be taken on one session:

- `INTERVIEW_PLANS[15].questions` from 4 to 3, leaving room for probes and the invitation;
- reserve the invitation up front rather than letting the question budget consume it;
- leave it, and accept that a thorough candidate trades their own questions for a fourth interview
  question — which, for a *practice* product, may be the right trade.

---

## State

The worker is back on `fake` (`llm provider=fake cv_parse=fake interviewer=fake evaluator=fake
tracing=off`), which is the resting state a dev stack should be left in. The API is a single
`pnpm --filter @readi/api dev`; a stale standalone `apps/api/dist/src/main` from a previous session
had been holding port 4000 with a dead `nest start --watch` beside it, which is why the report route
404'd before this run.

`pnpm db:seed -- --check` was clean before the run and nothing in it wrote content.

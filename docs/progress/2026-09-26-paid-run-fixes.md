# The paid run's findings, diagnosed and fixed

**2026-09-26, M3 phase 4.5, branch `feat/m3-interview-engine`.** The first paid interview run
(`2026-09-25-m3-paid-run.md`) produced zero follow-ups and openings that asked three or four things at
once. This note records what the database actually said, corrects that earlier note on one point, and
lists what changed.

---

## 1. One root cause, not three

The dev database held **published** question rows from before the one-ask retrofit (commit `6207ee5`,
"the backend bank's 70 planned follow-ups, and 34 prompts cut to one ask" — which landed *before* the
run). The importer was correctly refusing to update them: ADR-0014 decision 5, the seed importer never
rewrites published content. So the session pinned three-ask prompts with an **empty probe menu**.

| pos | slug | pinned | pinned probes | live then | live probes |
|---|---|---|---|---|---|
| 0 | `db-half-finished-transfer` | 3 asks | 0 | 1 ask | 2 |
| 1 | `mocking-what-you-do-not-own` | 3 asks | 0 | 1 ask | 2 |
| 2 | `the-estimate-that-slipped` | 4 asks | 0 | 1 ask | 2 |
| 3 | `who-is-allowed-to-see-this` | 3 asks | 0 | 1 ask | 2 |

That single fact explains all three symptoms at once — the multi-ask openings, the zero follow-ups,
and nothing pushing on question 1's code-only answer. The coverage log confirms the engine behaved as
designed: `has_probe: false` and `not_judged` on every criterion of every question, and **not one
`coverage` call** in `ai_call_log`. `machine.probes_to_judge` found an empty menu and correctly
skipped the call.

### The phrasing call was not at fault

Pinned against spoken, 4 of 4: it added a framing sentence ("Let's start with a scenario"), moved the
pointer to the snippet, and swapped "Explain" for "Walk me through". **It added no ask**, no example,
no hint, no narrowing. The three-and-four-part questions were the bank's.

But that is not evidence the rule holds — see §3.

### ⚠ One correction to the earlier note

That note's §4(c) named a third cause: *"the openings ask what the probes were written to ask, so even
with the bank repaired no follow-up will fire."* **That is wrong.** It compared the new probes against
the **stale pinned** opening. Against the live one-ask opening they are exactly complementary:

> **Live opening:** …Walk me through how that state comes about.
> **Probe 1:** What would you change? **Probe 2:** And the accounts that are already in that state?

Which are precisely the two things the owner observed missing from that answer. With the repaired bank,
question 1 would have probed both — and, on the proving run below, does.

---

## 2. What was actually still wrong in the bank

Auditing all 104 openings found a real residue the earlier note had not looked for: **ten openings
still hang a second ask off the first** with an explicit coordinator.

`what-to-cache-and-for-how-long` · `who-is-allowed-to-see-this` · `react-state-placement` ·
`test-design-money-transfer` · `two-bugs-one-slot` · `the-field-that-changed-shape` ·
`what-to-automate-first` · `where-your-test-data-comes-from` · `pushing-back-on-a-release` ·
`selenium-stale-element`

All ten are rewritten. Where the second half was the same criterion, the opening simply lost a clause
and a house depth cue restores the shape of the answer ("Which is the more serious? Take me through
it."). Where it was a different criterion it became that criterion's probe — `selenium-stale-element`'s
"would waiting longer help?" is now criterion 1's probe, making it the one question in the bank where
every criterion carries one. Two questions were asking a criterion **twice**, once in the opening and
once in a probe of its own (`selenium-stale-element`, `pushing-back-on-a-release`).

**Why the check for this is narrow.** `check-bank.mjs` has counted asks since the QA bank, as a *floor*
— enough things are asked for to justify the criteria. As a *ceiling* that counter is useless: it
reports more than one ask for **56 of 104** openings that ask exactly one thing, because relative
pronouns and existentials read as asks, and two passes at sharpening it moved 48 clean to 50. The
ceiling is therefore a different check — coordination, an explicit `and`/`or`/`then` after a comma
inside a sentence that is asking — which is clean on **94 of 104 with all 10 flags genuine**. A
two-part opening it cannot see is still a defect; it is just one a reader has to catch.

---

## 3. What changed

**Content.** The ten openings; `selenium-stale-element` gains a third probe; two `reviewer_notes` that
described the old prompts. The new error in `check-bank.mjs`, and the rule in the skill's house style
with its false-positive classes written down so nobody "fixes" the regex back into noise.

**The engine.** "The phrasing call may not add an ask" is now an invariant, not a request
(`interview/asks.py`, `calls.speak`): the asks in what the model said are compared with the asks in the
pinned wording, and more is invalid output — retried, then replaced by the pinned wording, which was
already the fallback for a model that will not answer. Same guard on the follow-up call. It is sound
*because* it is relative: a false positive in the question is a false positive in the phrasing of it,
and cancels. The counter is shared with `check-bank.mjs` through
`packages/shared-types/src/ask-vectors.json`, which both sides assert against, and the two agree on all
330 prompts and probes in `/content/seed`.

**The transitions** are the engine's now (`interview/transitions.py`). A phrasing call is never sent the
turns before it, so a model told to vary its transitions has nothing to vary from — the run opened three
of four questions with the same move, which is the model being consistent rather than careless. One line
per turn from a pinned list, keyed on the session id and the position: varies within a session, varies
between sessions, reproducible for M4.

**Prompt versions are one table, not one number.** `PROMPT_VERSIONS` in `service.py`; every prompt is
rendered through `_render`, which records the version as it renders. `interview_coverage_input` had been
rendered on every judged answer and named in no session's `prompt_versions`.

**`interview_intro.v2.md`.** v1 told the candidate "there is nothing to look up and nobody else is
listening". The transcript is stored, sent to a provider, read by us, and scored by M4 — and the very
next screen already said so (`complete.scoring`: "The whole conversation is recorded"). v2 claims less
and is true: practice, nothing goes to an employer, saved so they can read it back. What it is
deliberately **silent** about is who else reads it, because staff blind-scoring transcripts (spec §90)
has no consent type and no privacy copy — that is now an M4 blocker in `tasks/todo.md`, and the wording
is to be re-read when it is decided.

**`interview_candidate_questions.v2.md`** is warmer. v1 was almost all prohibitions with "two or three
sentences" as the only instruction about how to sound, and it answered "assessment happens separately
from me… I'm just the interviewer for this session" — every clause true, none of it warm. Warmth is
answering properly, not praising the question; the ban on "great question" stays.

**Dev drift.** `pnpm db:seed -- --check` is the old report with an exit code, and
`--force-published` is the narrow refresh: published rows the files still own, CMS-edited rows
untouched. A session now also logs a warning when it pins a question with no probes and more than one
criterion (`questionsWithNoProbes`), which is what this looks like from the inside.

---

## 4. The proving run (free, `LLM_PROVIDER=fake`)

Session `8643fee0-5661-4e1f-84b5-952ae1c2e982` on `owner-diagnostic@example.com`, Backend · Mid-level,
15 minutes, four questions each with two probes.

A deliberately thin answer ("I would check the logs.") drew a follow-up, then a second, then stopped at
`max_follow_ups`; complete answers drew none. The coverage log on that first answer is what the paid
run did not have:

```
criterion 0: not_judged,  has_probe=false, follow_up_index=null   ← the one the opening asks
criterion 1: not_covered, has_probe=true,  follow_up_index=0      ← and the probe the engine chose
criterion 2: not_covered, has_probe=true,  follow_up_index=null
```

`prompt_versions` on the session records `interview_intro: 2`, `interview_question: 2`,
`interview_candidate_questions: 2`, and the rest at 1 — including `interview_coverage_input`, for the
first time.

**What the fake cannot show**, and the second paid run therefore should: whether the model keeps to one
ask now that the openings ask one thing; whether the connective varies in its voice (the stand-in
returns the pinned prompt verbatim and ignores the instruction); and whether the candidate-questions
reply is actually warmer (the stand-in has a canned line).

---

## 5. Verification

`check-bank.mjs` clean (no errors, 53 pre-existing warnings) · worker: ruff, ruff format, `mypy
--strict`, **206 pytest** · API **480 Vitest** · web 155 · shared-types 95 · `pnpm lint` clean ·
`pnpm check:contracts` no drift · `pnpm test:e2e` green twice · `pnpm db:seed -- --check` reports
"the database matches content/seed".

Two test failures met on the way, both pre-existing on this branch and both fixed here:

1. **`e2e/onboarding.spec.ts` looked for the nav links in the wrong bar at 360px.** The header's
   `navigation "Main"` is deliberately empty for a candidate on a phone — the tab bar ("Sections")
   owns Practice and Profile — so the assertion found nothing. It has been failing on
   `mobile-chromium` since the tab bar landed in phase 4. Now asserts the rule rather than the width:
   whichever bar shows the link marks it as the current page.
2. **`e2e/content.spec.ts` was order-dependent.** `/api/content/practice` returns the first 20
   questions by difficulty and slug, so in a full parallel run whatever else has published for that
   role pushes the test's own question off the page — it passed alone and failed in the suite, twice.
   It now filters by the topic it created, which is unique to it.

One flake seen and **not** fixed: `interviews-advance.int.spec.ts` › "refuses a second exchange while
one is in flight" failed once under full-suite load and passes alone. It races two `Promise.all`
requests against the fake worker and depends on them genuinely overlapping; on a loaded machine the
first can acquire and release the Redis lock before the second arrives, and both get 200. Making it
deterministic means having the fake worker hold the lock open, which is a change to the fixture rather
than to the test — worth doing, not worth doing quietly in this change.

---

## 6. The checklist for the second paid run

Nothing below has been done: the worker is running the **new code** on `LLM_PROVIDER=fake`, and
arming it is yours.

**1. Confirm the database says what the files say.**

```bash
pnpm db:seed -- --check          # must print "the database matches content/seed" and exit 0
```

It is clean as of this change. If it is not — and a `--force-published` after any content edit is easy
to forget — do not start the run: whatever it names is what the session will pin.

**2. Restart the worker on Anthropic.** It is on `fake` now. Stop it, then:

```bash
cd apps/ai-worker
LLM_PROVIDER=anthropic LLM_MODEL_INTERVIEWER=claude-sonnet-5 uv run python -m readi_worker
```

`apps/ai-worker/.env` already says `LLM_PROVIDER=anthropic`, so a plain `pnpm dev:worker` is also a
paid worker — the env var is what makes it free. Check it before any unattended run, and put it back
to `fake` afterwards. The worker does **not** reload on file changes, so a restart is also how it picks
up the new prompts; the API (`nest start --watch`) already has them.

**3. Sign in as `owner-diagnostic@example.com`** (`correct horse battery staple`) — onboarded,
Backend · Mid-level, no variant. One thing to know: it now has **one completed session**, the free
proving run above. Question selection excludes what was seen in the last 3 sessions, so the paid run
will draw different questions from those four — which is fine, and probably better. To start from
exactly the state the earlier note described:

```bash
docker exec readi-postgres-1 psql -U readi -d readi -c \
  "delete from interview_sessions where id = '8643fee0-5661-4e1f-84b5-952ae1c2e982';"
```

Start from `/practice/new`, 15 minutes.

**4. Answer as yourself, and be incomplete on purpose.** The whole point of this run is the path the
last one could not reach, so on at least two questions answer the opening well and say nothing about
anything else. A complete answer should draw no follow-up; a thin one should draw up to two.

### What to watch for

- **Follow-ups fire.** Expect one or two on a thin answer. `ai_call_log` should now contain
  `coverage` rows as well as `interviewer` ones — there were **none** last time, and their absence is
  the cheapest single check that the fix is live. Budget **4–6¢** rather than 2–4¢ for that reason.
- **Each opening asks one thing.** If a spoken opening asks two, the guard did not catch it, which
  means the counter missed the shape — worth the transcript.
- **The pinned wording is not being spoken verbatim.** If a question comes out word for word as the
  bank wrote it, the guard rejected the model's phrasing three times and fell back. That is the safe
  failure, but it is a failure: look for `interview %s call added an ask; rejected` in the worker log.
- **The transitions vary**, and the last question says it is the last.
- **The candidate-questions reply is warmer** than "assessment happens separately from me". This is
  the one change the fake provider cannot show at all.
- **The intro.** Read it once on screen. It is rendered, not generated, so it will be exactly the
  wording in §3 — the thing to judge is whether it reassures while being true.

### Afterwards

```bash
S=<session id>
docker exec readi-postgres-1 psql -U readi -d readi -c "
select purpose, count(*), sum(cost_micro_usd) micro_usd, round(avg(latency_ms)) ms
from ai_call_log where session_id = '$S' group by purpose order by purpose;"

docker exec readi-postgres-1 psql -U readi -d readi -c "
select t.seq, t.speaker, t.state, t.follow_up_index as probe, t.text
from session_turns t where t.session_id = '$S' order by t.seq;"

docker exec readi-postgres-1 psql -U readi -d readi -c "
select t.seq, jsonb_pretty(t.criteria_covered) from session_turns t
where t.session_id = '$S' and t.speaker = 'candidate' order by t.seq;"
```

Then put the worker back on `fake`.

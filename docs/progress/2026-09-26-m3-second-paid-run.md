# The second paid interview run — what worked, and the four things it found

**2026-09-26, M3 phase 4.5, branch `feat/m3-interview-engine`.** Session
`8fbddf78-2fde-45d6-9ef1-9bb4bd3b4724`, `ayodeji_ajibade@yahoo.com`, Backend · Mid-level, 15 minutes,
`anthropic/claude-sonnet-5` for all three call purposes. 08:38 → 08:52 UTC, 23 turns, `completed`.

**The design happened this time.** Follow-ups fired on real gaps and quoted the candidate's own words
back at them; the intro is honest; the close was warm. The owner's verdict on the two probes that
mattered — the Android installed-base one and "which point took you longest to come around on" — is
the first evidence that planned follow-ups do the job they were designed for.

## What it cost

**7.8¢** (77,646 µUSD), 20 calls, 30,718 input and 1,621 output tokens.

| purpose | calls | µUSD | avg ms |
|---|---|---|---|
| `interviewer` | 12 | 39,678 | 2,821 |
| `coverage` | 4 | 20,634 | 3,461 |
| `follow_up` | 4 | 17,334 | 2,413 |
| **total** | **20** | **77,646** | |

Above the 4–6¢ estimate, for a reason worth keeping: **four of the twelve `interviewer` calls were
rejected phrasings** (§2), so the run paid for two questions three times over. A clean 15-minute run
of this shape is 16 calls, about 6¢. `coverage` calls now appear — there were none at all in the first
paid run, and their presence is the single cheapest check that the engine is doing what it was built
to do.

---

## 1. Question 1 asked two things, and no follow-up could fire

The opening was **pinned, not added by the phrasing call.** Side by side:

> **Pinned:** You are designing the error responses for an API that a mobile app and a web app both
> use. What does an error look like, and how does the client know what to do with it?
>
> **Spoken:** Let's start with API design. Say you're designing error responses for an API that's
> consumed by both a mobile app and a web app. What does an error look like in your design, and how
> would the client know what to do with it?

The model added a framing sentence and "in your design". Both asks are the bank's.

**And there were no coverage verdicts to show, because there was no coverage call.** The question is
`api-error-shape`, and it carries **zero planned follow-ups** against a three-criterion rubric, so
`machine.probes_to_judge` found an empty menu and skipped the call — correctly. The log is the honest
record of it:

```
criterion 0: not_judged, has_probe=false, follow_up_index=null
criterion 1: not_judged, has_probe=false, follow_up_index=null
criterion 2: not_judged, has_probe=false, follow_up_index=null
```

So the answer covering the format and never explaining how a client decides what to do was never
going to be probed. Two of the three criteria were charged for things nothing asked.

### Why neither check caught it: the question is not in the bank

**`api-error-shape` was cut on 2026-09-25.** `content/seed/blueprints/backend.md` decision 2: *"
`api-error-shape` and `the-counter-that-lost-updates` are cut, with their rubrics and stress sets. The
first was subsumed by `api-status-code-choice`, which asks it better with a real response body, and
its rubric duplicated `status-code-honesty` almost line for line."*

It was cut from the **files**. The row stayed in the database, **published**, with its pre-retrofit
two-ask opening and no probes — because **the importer never deletes**, deliberately: content removed
from a file stays, since a person may have edited it since. So a session selected it, pinned it, and
asked it.

- `check-bank.mjs` never saw it. It reads `/content/seed`, and the coordinated-ask rule added
  yesterday **would** have flagged "…what does an error look like, **and how** does the client know…"
  if the question were in a file. It is not.
- `pnpm db:seed -- --check` said "the database matches content/seed", because drift was measured only
  over rows the files *name* — and this was a row they had stopped naming. A blind spot by
  construction, in a check written the same day to stop exactly this class of failure.
- The `questionsWithNoProbes` warning at session creation **did** fire (0 probes, 3 criteria) — into a
  dev server's terminal, where nobody was reading. A log line is only marginally better than the
  passing report that let the first run go ahead.

**Fixed:** `--check` now reports **published rows that no seed file defines any more** and fails on
them, with the remedy named (retire; a re-import cannot reach a row with no file). It finds two, both
from that one cut:

```
published, and no seed file defines them any more — the files created these and have since
dropped them, and candidates are still being offered them:
  rubrics: api-error-contract
  questions: api-error-shape
```

**⚠ Still to do, and it needs you** (see §5): retiring them is an admin's act in the CMS, and doing it
by SQL would bypass the version and audit trail that ADR-0014 exists for. `--check` fails until it is
done, which is the behaviour we want.

---

## 2. The missing transitions were the guard falling back

Questions 2 and 4 arrived with no connective, and the last was not announced as the last. The engine
**did** choose one for both — `connective()` returns "Next one." for position 1 and "Last one." for
position 3 of 4. The reason they were not spoken is that both questions came out **verbatim** as the
bank wrote them:

| q | pinned asks | spoken asks | verbatim? | connective chosen |
|---|---|---|---|---|
| 0 | 3 | 3 | no | — (first question) |
| 1 | 1 | 1 | **yes** | "Next one." |
| 2 | 1 | 1 | no | "On to the next one." |
| 3 | 1 | 1 | **yes** | "Last one." |

That is the signature named in yesterday's checklist: the guard rejected the model's phrasing three
times and spoke the pinned wording, which carries no transition. The call arithmetic confirms it —
1 + **3** + 1 + **3** + 1 invite + 2 answers + 1 close = 12 `interviewer` calls.

**Why it rejected a faithful rephrasing: two asymmetries in the counter.** The guard compares asks in
what the model said against asks in the pinned wording, and that comparison is only sound if both
texts are counted on the same terms. Two words broke it:

- **`whom` was not counted.** Pinned: "What is going wrong, and **for whom**?" → 1 ask. The model's
  "what's going wrong, and **who** it affects" → 2. A faithful modernisation read as an added ask.
- **`whether` was counted.** Pinned: "…anything, at work or on your own." The model's "…**whether**
  that was at work or on your own" → an extra ask. `whether` is a subordinator far more often than an
  interrogative, which the coordination detector already documented as a false-positive class.

**Fixed:** `whom` in, `whether` out, in both implementations, with the asymmetries as named cases in
`ask-vectors.json`. Measured over the corpus first: seven prompts and three probes change count, **no
floor break**, `check-bank` still clean, and the two counters still agree on all 330 prompts and
probes. The corpus check is the point — a heuristic's direction of bias decides which way it hurts,
and this one is used on both sides of an inequality.

**Also fixed, so the safe failure stops being a stilted one:** the fallback now carries the
connective. It is the engine's own words, it adds no ask (there is a test pinning that for every line
in both pools), and without it a rejection makes the interview lurch from one question into the next
with nothing between them — which is exactly what the owner saw.

**And a rejection is now in `ai_call_log`,** as `error_code = "rejected_added_ask"` with
`status = "ok"`, because the call succeeded and cost money; what failed was our check on its output.
In this run the two rejections were findable only by noticing that a question had been spoken word for
word as the bank wrote it. That is transcript archaeology. Now it is a query:

```sql
select purpose, count(*) from ai_call_log
where session_id = '…' and error_code = 'rejected_added_ask' group by purpose;
```

---

## 3. "There's no real company behind this", twice

Turns 19 and 21 both open with it — correctly, by `interview_candidate_questions.v2`, which says that
where a question is about a real employer, saying so plainly in one sentence is the honest answer.
Both questions were about a real employer, and **each call is independent and never shown the turns
before it**, so a prompt that tells the model to disclaim has it disclaim every time. The same shape
as the repeated transitions, and it has the same answer: stop asking the model to remember.

**Fixed in `v3`** by moving the disclaimer to the **invitation**, which is spoken exactly once — the
state machine always speaks `InviteCandidateQuestions` before it answers anything, and
`FALLBACK_INVITE` carries the same sentence for when that call fails. The reply branch is told it has
already been said, not to repeat it "as a preface, not as a caveat, not in passing", and to lead with
the answer.

---

## 4. Coverage calls and rejections, confirmed

Four `coverage` calls, all `ok`, one per answered question that had probes in play — and none on
question 1, which had none. Four `follow_up` calls. No provider errors, no refusals.

The guard rejected **four** phrasings across two questions (three attempts each on questions 2 and 4,
the third exhausting the retries). They are `status = ok` rows in this run's log with no `error_code`,
because the field was added after it; from now on they are labelled.

---

## 5. What is left for you

1. **Retire `api-error-shape` and `api-error-contract`** in `/admin/content` as an admin. They are
   published rows for content cut from the bank on 2026-09-25, and until they are retired a Backend ·
   Mid-level session can still draw the question. `pnpm db:seed -- --check` fails while they are live,
   on purpose. Not done here because a status transition is an admin's audited act and SQL would
   bypass the trail.
2. **Consider whether `api-list-that-grew`'s opening is one ask.** "What is going wrong, and for
   whom?" now counts as **two** with `whom` added to the counter. It is defensible as one diagnosis
   with two dimensions, and it performed well in this run — the probes were the ones the owner
   praised — so nothing has been changed. But the coordination rule does not see "and for whom" (the
   `for` intervenes and `whom` is not in its trigger list), so if the answer is "that is two asks",
   both the question and the rule need a pass. A judgement for the next bank session, recorded rather
   than taken.
3. **The M4 consent blocker** still stands (`tasks/todo.md`): no transcript may be sampled for expert
   blind-scoring until it has a consent type and privacy copy, and `interview_intro.v2`'s silence
   about who reads a transcript is to be re-read then.

## State

The worker is back on **`LLM_PROVIDER=fake`** with all of this in it (it does not reload; it was
restarted). The API dev server watches and already has it. `apps/ai-worker/.env` still says
`anthropic`, so a plain `pnpm dev:worker` is a **paid** worker.

Verified: `check-bank` clean (53 pre-existing warnings) · worker ruff, format, `mypy --strict`, **213
pytest** · API **482 Vitest** · web 155 · shared-types 95 · `pnpm lint`, `pnpm format:check`,
`pnpm check:contracts` clean · `pnpm test:e2e` green · `pnpm db:seed -- --check` fails, correctly, on
the two orphans above and on nothing else.

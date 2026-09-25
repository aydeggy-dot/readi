# Planned follow-ups — the field, and QA as the pilot (handover)

**Branch `content/catalogue-banks`, 2026-09-23.** Two commits: `a049d29` the field, `53dbd49` QA's
probes. Implements `docs/progress/2026-09-23-planned-follow-ups.md`. Nothing published — every seed
file is still `status: draft` / `author: ai_draft`.

Next: the frontend and backend retrofit, then full-stack, which is still held.

## The field

`questions.planned_follow_ups` is `[{ criterion, probe }]` — the criterion's **position** in the
rubric, and one spoken sentence. Answer-key material, treated exactly like `ideal_points`.

- **Position, not the criterion's id**: criteria are deleted and recreated on every rubric edit, so
  their uuids do not survive one. **Not the dimension text** either: a rename would orphan a probe
  silently.
- **No condition field.** "Ask this only if the answer missed it" is the engine's rule, and it should
  not be branching on prose.
- **Json, not a child table**, for the same reason `rubric_criteria.levels` is: read and written as
  one value, and M3 pins it into the session snapshot whole.
- **Required on `QuestionInput`**, not defaulted — a defaulted field would let any client that has
  not heard of it silently wipe a question's probes on every save. Defaulted on `SeedQuestion`, so a
  bank written before the decision imports unchanged.
- The migration also had Prisma's `DROP INDEX questions_embedding_hnsw` in it, **for the fourth
  time**, in a change touching nothing to do with the vector. Deleted; the index is verified present.
- `PlannedFollowUp` is deliberately **not** in the worker contract registry. Nothing crosses to the
  worker until M3 puts it in the session bundle.

`check-bank.mjs`'s ask-count is now an **error**: every criterion is asked for by the prompt or by a
probe. Its old escape hatch — one broad clause covering two criteria, named in `reviewer_notes` —
existed only because there was nowhere else to put the second ask.

## The cap, and the selection rule

**A criterion may carry two probes and never three** (owner, after the pilot). One per criterion was
the rule going in, and the pilot measured what it cost: a criterion scoring two separable things then
has half of itself scored and never asked, which is the defect this field exists to remove. A third
means the criterion should have been split.

Because a question can now offer more probes than `max_follow_ups` allows — one offers four — the
engine needs a selection rule, and it is in the M3 plan: **prefer a criterion nothing has probed
yet**, and reach a second probe on the same criterion only when no other criterion is uncovered. So
**the first probe listed for a criterion is its primary one**, and the banks are written that way.

## QA — 35 prompts, 74 probes

Two per question, except `test-design-signup-form` and `api-collection-that-only-works-in-order`
(three each — a criterion that scores two things) and `pushing-back-on-a-release` (four: a
behavioural answer is a story and has to be drawn out).

Four critique passes on the reshape alone, one per subagent, each given the before/after and its own
brief and nothing about the other three: 93 findings, 73 applied, 13 left in `reviewer_notes`.
`content/seed/blueprints/qa.md` Appendix B3 has the detail.

## The bug this shook out

`review-doc.ts` built `new Map(followUps.map((p) => [p.criterion, p.probe]))`, so **the second probe
on a criterion silently overwrote the first** and the reviewer saw only one of them. It was correct
while one probe per criterion was the rule and wrong the moment the cap moved — a Map keyed on
something that had stopped being unique. Grouped now, and covered by a test I checked fails against
the old code before keeping it.

Worth carrying into the retrofit: **the generated page is what a reviewer actually reads.** A defect
there costs an expert's hour and is invisible to every other check in the repository.

## What the skill learned

Four new rules in `.claude/skills/question-bank/SKILL.md`, all from the pilot:

1. **A criterion may go without a probe only when the opening question asks for that criterion and
   nothing else.** All four passes found this independently. Where the opening was open — "What would
   you do?" — two criteria competed to be the answer, and a candidate who led with a *probed* one
   forfeited the un-probed one with no second chance, because the engine can only probe what has a
   probe. Six questions, three of them on a criterion worth 40% or more; all six openings narrowed.
2. **Ask the criteria in the order the work happens.** Two questions probed what the candidate would
   decide *before starting*, after they had described doing it.
3. **A probe must not name what its criterion scores them for noticing** — with more force than a
   prompt, because a probe arrives after they have already failed to say it.
4. **Never read a scoring constraint out loud.** One probe said "explained without quoting a
   regulation at them": an instruction meant for the evaluator, which told the candidate whose
   data-protection training is their strongest asset not to use it. Three of the four passes caught
   that one clause.

And one thing the reshape found in the *old* bank: `where-the-bugs-have-been` charged 40% for a
criterion **none** of its three clauses asked about. Counting asks cannot match them to criteria;
writing a probe per criterion can.

## Still open

- **"Needed no prompting" is a signal we throw away** — a candidate who covers everything unprompted
  scores the same as one probed twice. `session_turns.criteria_covered` will hold the facts from M3;
  whether M4's report may read them is a separate decision, and the coverage log is never a
  substitute for the evaluator's own scoring.
- **`max_follow_ups = 2` leaves the engine no budget of its own** to chase a vague answer, because
  both slots are planned. M3 decision.
- **Five openings ask a criterion lighter than one of their probes.** Nothing is unreachable, so this
  is exposure to the engine wrongly judging a criterion "covered" — which is what the coverage log
  exists to make auditable.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` (635 TypeScript + 77 Python), `pnpm test:e2e`,
`E2E_SLOW_NETWORK=1 pnpm test:e2e slow-network`, `check-bank.mjs` (no errors; 53 warnings, the same
53 as on `main`), `check-stress.mjs`, `pnpm db:seed -- --dry-run` (35 questions to update, 65
unchanged). The first commit was verified on its own tree before the bank landed on top of it.

`pnpm check:contracts` passes on a committed tree — it regenerates and compares against the git
index, so it reads uncommitted regeneration as drift.

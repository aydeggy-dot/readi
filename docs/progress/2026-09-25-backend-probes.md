# The backend planned-follow-up retrofit (handover)

**Branch `content/catalogue-banks`, 2026-09-25.** The last of the three drafted banks. Nothing is
published — every seed file is still `status: draft` / `author: ai_draft`. **Next: full-stack, which
is a tagging pass, and it is still held.**

## What landed

**34 prompts cut to one clause, 70 probes**, and four critique passes run separately on the reshape
alone — 44 findings, 34 applied, 10 recorded or rejected. `content/seed/blueprints/backend.md`
Appendix D has the detail; `tasks/todo.md` has the worklist.

The mis-aim check ran first, as the owner required, and it changed **eight** openings that a
mechanical cut would have got wrong — most sharply `db-money-as-a-float`, whose opening asked
criterion 2 while criterion 1 was the one left without a probe and therefore without recovery.

## The finding that generalises, and it is about probes rather than prompts

**A probe that names what its criterion scores is worse than a clause that did.** A clause in a
triple-barrelled prompt was asked of everyone; a probe is asked *only* of the candidate whose answer
missed that criterion. So a leading probe does not test a miss — it converts a miss into a gift, to
exactly the candidate who had not earned it. Eleven probes were rewritten on this, and the clearest
is `mocking-what-you-do-not-own`: "what would have caught this that is **not a test**" made both of
its bottom bands unreachable, because they are defined by reaching for another test. It now asks
"Two days went by before anyone knew — what would have shortened that?", and a candidate who says
"more unit tests" earns their level 1 honestly.

This is a stronger version of the rule already in the skill, and it is now written there as such.

## The check that had been matching half the defect

The eight bare "Not addressed." level 0s left as warnings on 2026-09-24 became errors the moment
their criteria were probed — the check predicting its own future work, which is the best evidence so
far that filing them as warnings was right.

Then the fairness pass found the hole: **the check matched whole strings only**, so "Not addressed —
the answer is entirely about the code" escaped it on a 35% and a 25% criterion. The trailing clause
defeated the checker without making the band any more reachable, because the band still opens by
saying the candidate did not answer. `check-bank.mjs` now also errors when a level 0 merely *opens*
with a non-answer and the criterion is probed. That found **nine more, across all four rubric
files**, including one in `rubrics.shared.yaml` that reaches every bank.

Total across the two days: **twenty-two level 0s** rewritten to what a candidate who is asked by
name, and still gets it wrong, actually says.

## What the passes disagreed about, which is the useful part

- `what-to-cache-and-for-how-long`'s probe was "the best probe in the bank" (remote manager) and "I
  have no idea what this is asking" (nervous junior). The junior is the candidate, so it changed.
- `the-estimate-that-slipped` was "the best-converted question in the bank" (senior) and an ambush
  that springs "have you ever done this for real" at the end (junior). Left as it is; its probe was
  widened so a candidate who has not done it is not capped, which was a separate fairness finding.
- `the-ticket-nobody-can-explain`: three passes said narrow the opening onto criterion 1, which was
  done. The manager argued the opposite — open with "write me the message", so the one
  remote-predictive artefact in the bank is guaranteed rather than conditional. Recorded, not done.

## For the owner

1. **The diagnosis-first drift, and it is bank-wide.** All 18 snippet questions now open on "what is
   happening" and none on a decision; the guaranteed-asked share of the score averages **36.8%**, and
   in nine questions the heaviest criterion sits behind a probe. The manager pass wants them
   inverted. Its own hedge is why this was not done: the case rests on volunteering and being
   prompted scoring the same, **which is already an open M4 item from the QA pilot**. Close that and
   this shrinks to a question of interview feel. It is equally true of frontend and QA, so it is one
   decision about all three banks, not a backend one.
2. **A one-clause opening does not tell the candidate how much to say.** The junior pass's headline:
   the grammar asks for one thing and the rubric charges for three. Fixed where an opening had become
   a riddle, and `incident-you-contributed-to` regained "Take me through it" because its three
   clauses had been the story's shape rather than triple-barrelling. Whether every diagnosis opening
   should carry a depth cue is a house-style decision.
3. **Fourteen probes are some form of "What would you change?"** The senior pass deliberately
   declined to call it a defect and flagged it for you anyway.

## Checks

`check-bank.mjs` (no errors; 53 warnings, the baseline — the eight backend heads-up warnings are now
fixed rather than pending), `check-stress.mjs` (103 sets, every separation passes, no score moved),
`pnpm db:seed -- --dry-run`, `content:review-doc`, `format`, `lint`, `typecheck`, 375 API and 91
shared-types tests.

The stress answers were written against the old prompts and were not rewritten. That is deliberate
and is now the owner's standing decision: the sets are re-written against the probes **once**, after
all four banks are retrofitted, rather than three times.

# The depth cue on diagnosis openings (handover)

**Branch `content/catalogue-banks`, 2026-09-25.** The owner's decision 2 on the backend retrofit
(`docs/progress/2026-09-25-backend-probes.md`), applied across all three drafted banks in one pass.
Nothing is published — every seed file is still `status: draft` / `author: ai_draft`.

## What landed

**54 of 104 prompts gained a closing depth cue.** No opening was rewritten, no criterion moved, no
rubric changed. Per bank: frontend 26 of 35, backend 15 of 34 (16 carry one, counting
`incident-you-contributed-to`, which regained "Take me through it." during the retrofit itself), QA
13 of 35. Blueprint detail: `frontend.md` Appendix B5 (the rule in full), `backend.md` Appendix E,
`qa.md` Appendix B4.

The reason, from the nervous-candidate pass on the backend bank: a one-clause opening tells a
candidate _what_ is wanted and nothing about _how much_, so the grammar asks for one thing and the
rubric charges for three. The old triple-barrelled prompts carried the shape of the answer as a side
effect of carrying its content; cutting them to one clause took the shape away with it. The cue
restores it and asks for nothing new.

## Three cues, chosen by a rule rather than by ear

A single cue on 54 prompts would read as a form letter to the reviewers and sound like a tic in a
spoken session, so there are three, assigned mechanically:

| Cue                             | When                                                                             | fe / be / qa |
| ------------------------------- | -------------------------------------------------------------------------------- | ------------ |
| "Walk me through what you see." | a snippet or screen, and the prompt has not already pointed at it                | 7 / 1 / 1    |
| "Walk me through it."           | a snippet or screen the prompt already points at — "what you see" would echo     | 9 / 9 / 11   |
| "Take me through it."           | nothing on screen                                                                | 10 / 6 / 1   |

The distribution is itself a fact about the banks: QA's house opening is literally "On your screen
is…", so eleven of its thirteen take the short form.

## Where the line was drawn — this is the judgement to check first

A cue went on an opening that asks the candidate to work out **why** something is as it is, or what
is wrong with what is in front of them. It did **not** go on:

- **design, decision and enumeration openings.** "What would you test?", "Which thirty?", "What else
  does that screen have to show?" already tell a candidate a list is wanted. This is why QA — the
  bank with the most one-clause openings — took the fewest cues: twenty-two of its thirty-five
  openings are of this kind.
- **behavioural openings.** "Tell me about a time…" is a narrative directive and carries its own
  shape. `incident-you-contributed-to` is the single exception and predates this pass.
- **artefact openings.** "Write me the message you would send them", "Give me the words", "Tell me
  what you write" — each names the thing to produce.
- **openings that already walk.** `explain …`, `walk me through <noun>`, `talk me through <noun>`.
  Eight of backend's eighteen uncued openings are this shape, which is why backend took the fewest
  cues relative to its size. `Tell me what X` is deliberately **not** in this set — it is a politer
  interrogative with no depth in it, and every one of those got a cue.

## The checker change, and why it was necessary rather than tidy

`countAsks` treats "take/walk/talk me" as an ask, so appending a cue would have handed **every**
diagnosis question a free ask — and `asks + probes < criteria` is the error that catches a criterion
charging for something nobody asked for, the rule this drafter broke eighteen times in one bank.
`check-bank.mjs` now strips a house-style cue before counting, from a **closed list** (`take|walk|talk
me through it|what you see`), so that anything with a noun in it is still the ask it is. A prompt
that is nothing but a cue still counts as one ask.

**Its output is byte-identical to HEAD's** — no errors, the same 53 warnings — which is the evidence
that 54 prompt edits moved no criterion into or out of being asked for.

## For the owner

1. **The line between a diagnosis opening and a decision opening is a reading, and there is no check
   behind it.** `check-bank.mjs` counts asks and probes; it cannot tell which criterion an opening
   names, and for the same reason it cannot tell a "why is this broken" from a "what would you do".
   That is the same gap the mis-aim check has, and the skill's own lesson is that a rule remembered
   once per question gets broken. The next bank will need this applied by hand again.
2. **Three closest calls, all left uncued.** `it-failed-and-we-do-not-know-why` ("what you can and
   cannot find out from this" — two parts, so arguably shaped already);
   `fetch-failure-states` ("what else does that screen have to show?" — enumeration, but its rubric
   charges for three things and it is the frontend question most likely to be under-answered); and
   `intermittent-failure-triage` / `the-suite-nobody-trusts` in QA, both "what would you want to know
   about…", which sit exactly on the diagnosis/decision line.
3. **Nothing was done about the stress sets.** They remain written against the pre-probe prompts,
   which is your standing decision: one rewrite, after all four banks are retrofitted. This pass adds
   nothing to that rewrite's scope — a cue changes no descriptor and no score.

## Checks

`check-bank.mjs` (no errors, 53 warnings, byte-identical to HEAD), `check-stress.mjs` (103 sets,
every separation passes, no score moved), `pnpm db:seed -- --dry-run` (14 files, no validation
error), `content:review-doc`, `format`.

# Frontend planned follow-ups — the retrofit, and the owner's decisions (handover)

**Branch `content/catalogue-banks`, 2026-09-24.** Commits: `751d4c6` the retrofit, and this one for
the decisions. Implements the shape QA piloted (`docs/progress/2026-09-23-planned-follow-ups-pilot.md`)
on the frontend bank. Nothing is published — every seed file is still `status: draft` /
`author: ai_draft`. **Next: backend (68 probes), starting with decision 5 below.**

## What landed

13 prompts re-aimed and **81 probes** across 35 questions. Four critique passes on the reshape alone,
one per subagent, each given the before/after and its own brief and nothing about the other three:
**51 findings, 40 applied, 11 recorded.** `content/seed/blueprints/frontend.md` Appendix B3 has the
detail; `tasks/todo.md` has the working list.

The finding that matters beyond this bank, and it is not what the QA pilot taught: **a prompt cut to
its first clause is not a prompt cut to its first criterion.** Deleting trailing clauses was right in
22 of the 35 questions and wrong in six, where the criterion left without a probe was then not the
one the opening asked — and with no probe there is no recovery by construction. Now a rule in
`.claude/skills/question-bank/SKILL.md`.

## The owner's decisions, 2026-09-24

1. **`stuck-and-asked-for-help` keeps the "asked" frame, and what counts as asking widens.** The
   opening says "and ended up asking someone for help" so the probes stop ambushing a candidate who
   told a solo story. Asking now explicitly includes posting in a community, finding someone who hit
   the same error, a Discord or WhatsApp group, an issue thread. **Recognising you are stuck and
   reaching outward is the signal**; a colleague is one way to do it, not the thing being scored.
   The descriptors of `help-seeking-judgement` are to be rewritten to match, so the question is
   coherent *and* fair. Written into the skill as a rule, because it generalises: where the act
   itself is the criterion, widen what counts as the act rather than excusing its absence.

2. **The six fairness clauses go in before backend**, starting with `help-seeking-judgement`
   criterion 3 — 40% of its question, with no route above level 0 for a self-taught candidate. That
   is a fairness bug aimed squarely at the bootcamp graduate who is the core market. The others:
   `test-brittleness-diagnosis` 2, `performance-investigation` 2, `semantic-html-diagnosis` 3,
   `secret-exposure-diagnosis` 3, `resilient-layout-reasoning` 3. **New rule in the skill:** a
   criterion that assumes a workplace needs a route for someone without one — and the count is the
   tell (`rubrics.shared.yaml` eleven clauses across thirty criteria, `frontend/rubrics.yaml` two
   across ninety). **Check QA and backend for the same gap.** The three descriptors the format made
   unreachable are fixed in the same pass — `state-placement-reasoning` 2 level 1 ("notices the
   duplication *only when prompted*", when the prompting is now built in), `url-state-reasoning` 3
   level 0, `client-boundary-reasoning` 2 level 0 — **and QA is to be checked for those too.**

3. **`error-only-in-production`'s opening is tightened.** It had been opened up to "What do you do
   with this?" so the 45% criterion was not steered away from; two criteria then competed to be the
   answer, which is the defect just fixed elsewhere. It is back to "What do you do with that stack
   trace?", which asks the un-probed criterion and nothing else — and the 45% criterion has a
   follow-up, so answering the prompt literally is not penalised.

4. **Five uncertain probes stay as they are, flagged in `reviewer_notes`** for the expert reviewers
   rather than changed on a drafter's hunch: `react-state-placement`'s cost probe ("does *annoy*
   invite analysis or complaint?"), the two opening/probe swaps (`it-works-for-me`,
   `state-that-can-disagree`), `telling-a-user-the-form-failed`'s thin opening,
   `fetch-failure-states`' deliberately-open 500 follow-up, and `something-you-built`'s second
   follow-up.

5. **The prompt mis-aim check is the first thing the backend pass does.** Per question: name the
   criterion the opening asks, check it is the one without a probe, and check nothing else answers
   the opening as well. `check-bank.mjs` cannot see this — it counts asks and probes and cannot tell
   which criterion an opening names.

## What is now a rule, and what was a one-off

In `SKILL.md`: the mis-aim check (5), the workplace-route rule and the widened-act rule (1, 2), and
the unreachable-descriptor rule (2). One-off and left in the bank: the six descriptor rewrites, the
three dead descriptors, the tightened opening (3), and the five flags (4).

## Checks

`check-bank.mjs` (no errors, the same 53 warnings as `main`), `check-stress.mjs`, `pnpm db:seed --
--dry-run`, `pnpm format`, `pnpm --filter @readi/api content:review-doc`, and 365 API + 120 web + 91
shared-types tests. The stress answers were not touched: they are a rubric test, and no rubric
changed in this pass — which is also why decision 2's descriptor rewrites need their own stress run.

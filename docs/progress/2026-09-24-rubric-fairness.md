# The fairness clauses and the dead descriptors (handover)

**Branch `content/catalogue-banks`, 2026-09-24.** Items 1–3 of the owner's five decisions on the
frontend planned-follow-up retrofit (`docs/progress/2026-09-24-frontend-probes.md`). Nothing is
published — every seed file is still `status: draft` / `author: ai_draft`. **Next: check QA and
backend for the same two gaps, then the backend retrofit (68 probes).**

## What landed

Nine descriptor changes across two rubric files, one question's `ideal_points` and `reviewer_notes`,
and one stress answer rewritten. **No question's prompt, context, rubric assignment or probes
changed.** `content/seed/blueprints/frontend.md` Appendix B4 has the table and the reasoning.

### Decision 1 — `stuck-and-asked-for-help`, and what counts as asking

`help-seeking-judgement` criterion 3 is 40% of that question and the criterion **is** the act, so
the act was widened rather than its absence excused. Asking is now defined, in the criterion's
description and in its level 3 and level 4 descriptors, as reaching outward by whatever route was
open — a colleague or a mentor, and equally a community, a group chat, an issue thread, a question
posted where strangers would see it. The protective clause that was already there ("a team that
treats asking as weakness is a fact about the workplace, not a fault in the candidate") now reads
"or no team at all".

**The widening is in the rubric, not in the opening**, which still says "asking someone for help" as
the owner's decision wrote it. Whether it should say so aloud as well is the one question this pass
sends back, and it is in the question's `reviewer_notes` for the expert reviewers too: a self-taught
candidate who hears "asking someone for help" may still hear a question about a workplace they have
not had, and no rubric clause reaches them before they answer.

This rubric is shared by four roles, so the change reaches the backend, QA and full-stack banks as
well. The header of `content/seed/rubrics.shared.yaml` records why.

### Decision 2 — the six fairness clauses and the three dead descriptors

The six criteria each gained one sentence saying what they are scored on and what they are not, and,
where the assumption had reached the ladder, one reworded descriptor. The six are
`help-seeking-judgement` 3 (shared), `test-brittleness-diagnosis` 2, `performance-investigation` 2,
`semantic-html-diagnosis` 3, `secret-exposure-diagnosis` 3, `resilient-layout-reasoning` 3 — a
colleague, a team's test suite, a profiler, standing to argue with a design, the provider's
credentials, and production content, respectively.

The three descriptors were defined by the absence of what their own probe supplies, so no candidate
the probe reached could land on them. All three are now defined by what the candidate says.

`check-bank.mjs` refused four of the new descriptions at first, for the reason worth writing down:
`criterionDescriptionMaxLength` is **300 characters**, and a fairness clause written as a paragraph
does not fit beside the sentence explaining the criterion. Two of them were moved down into the
level descriptors, which have their own 300 and are where the evaluator is actually reading. That is
the better place for a route anyway — a clause in the description is guidance, a clause in level 3
is a score.

### Decision 3 — `error-only-in-production`

Already done, in commit `a294ea6` on 2026-09-24: the opening is "What do you do with that stack
trace?", which asks the un-probed criterion 1 and nothing else, and the 45% criterion 2 has a
follow-up so answering the prompt literally is not penalised. Verified, not re-done.

## Checks

`check-bank.mjs` (no errors; **53 warnings, byte-identical to HEAD's** — diffed against a worktree
at `a294ea6`, not eyeballed), `check-stress.mjs` (103 sets, every separation passes, no score
moved), `pnpm db:seed -- --dry-run`, `pnpm --filter @readi/api content:review-doc`, `pnpm format`,
`pnpm lint`, 365 API + 91 shared-types tests.

Order matters for two of those: **generate the review docs, then format.** The committed
`content/seed/review/*.md` are prettier output, and running `format` before `content:review-doc`
leaves three files differing from HEAD in code-block whitespace alone.

## Two things found on the way, neither of them fixed

1. **A stress set that does not reach the descriptor you changed proves nothing.** Every
   `help-seeking-judgement` answer had a colleague to ask, so the whole set passed the widened
   criterion without exercising it. The `correct-poorly-explained` answer was rewritten — same
   substance, said just as badly, but self-taught and asking in a cohort WhatsApp group — and still
   scores 3 / 3 / 3. Worth a line in the skill if the backend pass hits it again.

2. **The reviewer pages are built per directory, not per role.** `buildReviewDoc` filters questions
   by the seed file's path (`inRole(file, role)`), so `stuck-and-asked-for-help`,
   `feedback-on-your-code`, `the-overnight-blocker` and `something-you-built` — four role-general
   behavioural questions that live in `content/seed/frontend/` and carry `roles: [frontend, backend,
   qa, fullstack]` — appear only on the frontend reviewer's page. A QA reviewer is asked to sign off
   a bank of 35 while their candidates are offered 45. This is a code change in
   `apps/api/src/content/review-doc.ts`, not a content one, and it is the owner's call whether the
   expert review needs it before the reviewers are sent the pages.

## Not started, and deliberately

**Checking QA and backend for the same two gaps** — the todo item between this pass and the backend
retrofit. One mechanical signal to start from, and it is only a signal: a regex for the phrasing
these clauses use ("never on", "counts the same", "not a fault") finds all five of the frontend
clauses written today and **none at all** in `content/seed/backend/rubrics.yaml` across its 87
criteria, against three in QA's 99. It under-counts — it finds five of the eleven the owner counted
in `rubrics.shared.yaml` — so it is a place to look, not a count to quote.

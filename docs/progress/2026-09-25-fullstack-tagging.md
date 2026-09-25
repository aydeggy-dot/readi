# The full-stack tagging pass (handover)

**Branch `content/catalogue-banks`, 2026-09-25.** Held since 2026-09-22 so that it would inherit
whatever the three banks ended up carrying, and run once at the end rather than three times. Nothing
is published — every seed file is still `status: draft` / `author: ai_draft`. Blueprint detail:
`content/seed/blueprints/fullstack.md` Appendix C.

## What landed

**Two questions changed hands; everything else was an audit that confirmed the banks were already
right.** A full-stack candidate is now offered **64 of the 104 questions** in the three banks — 31 of
frontend's 35, 31 of backend's 34, 2 of QA's 35 — against 11 when the blueprint was written and 62
before this pass.

Three edits in total: `roles: [qa]` → `roles: [qa, fullstack]` on two QA questions, a
`reviewer_notes` line on each saying why and what the drafter is unsure of, and one word in
`test-data-judgement` (level 1 of criterion 3 said "names removed by **the tester**", which names a
role the candidate may not hold). No prompt, no weight, no descriptor otherwise moved.

## The frontend and backend banks needed nothing

Both were drafted with the second role applied question by question, so this was an audit.

**Every question general to its role already carries `fullstack`.** The seven that do not are
stack-tagged for a variant this role does not offer — Angular (2), vanilla JavaScript (2),
Java + Spring (2), and `python-blocking-call-in-async` — so no full-stack candidate could be asked
them whatever we decided.

**The stack-variant rule — the trap the blueprint was written around — is fully applied.** All
thirteen stack-tagged questions carrying `fullstack` reach at least one of this role's six variants.
Reach per variant: `nextjs` 8, `react-node` 6, `laravel-vue` 4, `django-react` 1, `ruby-rails` 0,
`dotnet-react` 0.

**The one candidate for a re-tag was declined.** Adding `django-react` to
`python-blocking-call-in-async` would close a blueprint target by tagging (1 of 2 → 2 of 2), but the
snippet is `@app.get` — FastAPI — and the drafter had already asked in `reviewer_notes` whether
`python-backend` covering Django and FastAPI at once is a stretch. Putting a FastAPI snippet in front
of someone preparing for Django + React is the unfairness the stack rule exists to prevent. Those
three variant shortfalls are a writing gap, and `check-bank.mjs` reports all three every run.

## QA: two crossed over

The owner's brief was to consider whether **one or two testing-mindset questions** should. Two did,
chosen for the testing judgement a developer who owns a feature end to end needs rather than for QA
craft:

- **`what-to-test-when-there-is-no-time`** — deciding what to check when there is no time to check
  everything. The only risk-prioritisation question in any bank, and its rubric is role-neutral:
  impact against likelihood, a list with a cut line, and saying plainly what was not covered.
- **`where-your-test-data-comes-from`** — in a small team the person offered a copy of the production
  database is the developer setting up their own environment, not a tester. Nothing in either bank
  asks about personal data in a test environment, and the NDPA makes it a question this product
  should be asking.

Everything else in that bank is testing as a discipline — automation suites, defect workflow, CI
pipelines, test-case design, selector strategy. A full-stack engineer meets those as a consumer, and
the frontend bank already gives them `what-to-test-on-a-login-screen` and
`the-test-that-broke-for-nothing`.

## For the owner — least certain first

1. **The brief said "testing mindset", and the strongest transfer in the QA bank is not one.**
   `the-field-that-changed-shape` (mid, `testing-apis`) puts an endpoint's `salary` field going from
   a number to an object overnight, with the Android app showing nothing, and asks what it means for
   the apps already reading it. That is "what is the client entitled to assume" — the whole of
   `fullstack-boundary`, this role's defining topic — and on merit it beats both questions I did tag.
   I left it because it is a contract question rather than a testing-mindset one, which was the brief,
   and because its answer key leans on contract checks running in the API's own pipeline, which is QA
   craft. **If the ~8 boundary questions are not imminent, this is the one to tag in the meantime.**
2. **`what-to-test-when-there-is-no-time` opens "There are forty test cases you would normally run".**
   A full-stack developer at a startup has no forty written test cases. The scenario supplies the
   list, so it is answerable — but it may read as a QA role-play to the role we have just given it
   to. Flagged in its `reviewer_notes`. Changing the opening would change it for QA candidates too,
   which is why I did not.
3. **`fullstack` does not support `test_design`.** Its `supported_question_types` is
   `technical, scenario, behavioral`, so QA's three archetypal "What would you test?" questions
   cannot carry this role at all — `check-bank.mjs` would reject them. If the testing mindset should
   reach full-stack through those, it is a one-line change to `roles.yaml`, not a re-tag. I did not
   make it: the role's supported types are a catalogue decision, not a tagging one.
4. **The blueprint's "roughly two thirds will transfer" was wrong, and the direction matters.** In
   the event every general question transferred and the only reason to say no was the stack. That may
   be the right answer for the broadest of the four roles, or it may be over-tagging that only a
   practitioner can see — so `content/seed/REVIEW.md` §7 now puts it to the expert as exactly that
   question, with the seven exclusions and their reason stated.
5. **What is left of this role is writing, not tagging.** No track at either level
   (`track_not_found` today), `fullstack-boundary` 0 of 5 and `deployment-basics` 0 of 4 — the ~8
   questions the blueprint names. This pass did not touch them and they are the bulk of the role's
   remaining work.

## Checks

`check-bank.mjs` (no errors, the same 53 warnings), `check-stress.mjs` (103 sets, every separation
passes, no score moved), `pnpm db:seed -- --dry-run`, `content:review-doc` (full-stack page 62 → 64,
QA unchanged at 45), `format`, and 375 API tests — including the corpus test that asserts, per role
in `roles.yaml`, that every question carrying that role is on that role's page.

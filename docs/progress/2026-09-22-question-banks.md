# Question banks — frontend and backend (handover)

**Branch `content/catalogue-banks`, seven commits from `main` at `00daa6f`. 2026-09-22.**
Next: the QA bank, in a fresh session. Nothing here is published — every file is `status: draft`
and `author: ai_draft`, so production refuses to publish any of it until a human marks it reviewed
(ADR-0014 decision 6).

## Where the banks are

|          | Questions | General | Stack-tagged | Was | Offered to a candidate    |
| -------- | --------- | ------- | ------------ | --- | ------------------------- |
| Frontend | 35        | 24      | 11           | 8   | 36 in the pool            |
| Backend  | 37        | 25      | 12           | 3   | 41 in the pool, ~28 each  |
| QA       | 3         | 3       | 0            | 3   | its own wave              |

72 rubrics and **360 synthetic stress answers** (`evals/datasets/synthetic/{frontend,backend}/`),
all passing both separations. Every core topic meets its blueprint floor at both levels for
frontend and backend; QA and full-stack are untouched and report their shortfalls every run.

Checks, all green: `check-bank.mjs` (no errors, 54 warnings — QA's shortfalls and three QA prompts),
`check-stress.mjs`, `pnpm db:seed -- --dry-run`, `pnpm format`.

## What the owner decided, and what followed

**Six decisions on the frontend bank** (commit `9a596d1`). All applied. Two had consequences worth
knowing:

- **`js-async-ordering`: keep the mechanism, change the snippet, mid only.** The `console.log`
  ordering snippet is gone; it is now a click handler that sets "Saving…" and blocks the main
  thread for two seconds so the message never paints. It was the narrowest separation in the bank
  at +1.30 and is now +2.45. **Moving it off intern-junior took `javascript-fundamentals` below its
  floor there**, so `js-loop-that-returns-nothing` was written to fill the slot — a `return` inside
  a `forEach` callback. That is the 35th frontend question and it is the owner's to cut.
- **Apply the descriptor finding now, across all 34 rubrics.** 82 descriptors rewritten so a
  specific wrong answer has words to land on, with the wording taken from each rubric's own
  `fluent-but-wrong` stress answer. No score moved. **This is the change that went wrong — see
  below.**

The other four: `angular-view-did-not-update` kept and flagged for an Angular specialist;
`something-you-built` kept unchanged; `react-state-placement` kept (not subsumed — neither
`state-that-can-disagree` nor `url-as-state` asks where shared state should *live*); both Vue
questions kept in `<script setup>` and flagged for the reviewers.

**Version-sensitive marking** is a `reviewer_notes` convention, not a schema field — the seed
contract would have silently dropped the field. `grep -l 'Version-sensitive'
content/seed/*/questions.yaml` finds all fifteen across both banks. **The re-check cycle does not
exist yet** and is open in `tasks/todo.md`: the marking makes them findable, which is not the same
as checked, and three of four claims checked on 2026-09-22 had moved.

## The backend bank

37 questions, 35 new rubrics, seven new topics (`caching`, `async-work`, `auth`, `concurrency`,
`backend-testing`, `observability`, `system-design-basics` — five of which DevOps, data engineering
and full-stack will reuse). `escalating-early` and `unfamiliar-code-approach` went into
`rubrics.shared.yaml` because their questions carry all four wave-1 roles; they are the second
`written-communication` and `own-work` questions the frontend pass said belonged here, and they
close both shortfalls `check-bank.mjs` had been reporting since that pass.

Fact-check: **four of nine claims had moved**, one of them a defect in a question rather than a
note — `spring-default-error-body` showed a body containing `trace` and `message`, both of which
are off by default with the keys omitted entirely, so nobody would ever see that response.

Four critique passes, ~110 findings, 64 applied and 19 left in `reviewer_notes`. Stress test: 37
rubrics × 5 answers, written blind by seven subagents, then scored — all 37 pass; the exercise
broke one rubric outright and sharpened 23 descriptors.

## Open — the six decisions in the backend blueprint's Appendix C

In the order they matter. The first two are the ones that need an answer before QA is worth
starting, because both change what a bank is *for*.

1. **The level tag does almost no work.** Twenty of the twenty-five general backend questions carry
   both `intern-junior` and `mid`, so the two pools are nearly the same bank. A critique pass named
   ten it would keep at junior and would make the rest mid only. **Recommendation: take it, and
   accept the shortfall rather than padding.** A level that means nothing is worse than a level
   with a gap, and the gap is then visible in `check-bank.mjs` every run instead of hiding behind a
   met target. It is not a change a drafter should make alone, because it puts several core topics
   below the floor at `intern-junior` — which is the honest state of a bank written mid-first.
2. **Three questions two passes wanted cut**: `api-error-shape` (subsumed by
   `api-status-code-choice`, which asks it better with a real response body in front of the
   candidate), `the-counter-that-lost-updates` (the same read-modify-write as
   `two-people-bought-the-last-one`, at lower stakes) and `what-happens-when-it-is-down` (no
   artifact; its strongest answer is a product decision). **Recommendation: cut the first two, keep
   the third.** `api-error-shape`'s rubric duplicates `status-code-honesty` almost line for line,
   and a `python-backend` candidate currently meets read-modify-write three times. The third is the
   one question in the bank where the candidate decides what a user is *told*, which the engine
   follows up well — narrow it to that clause rather than losing it.
3. **The shape of the bank.** 22 of 37 questions hand the candidate a snippet with a planted
   defect; the behavioural share is 3 of 37 against the blueprint's own stated target of about one
   in four. **Recommendation: spend the next six slots on judgement and communication, not
   snippets** — and fix the target in the blueprint if one in four is no longer what we want.
4. **Four questions a remote hiring manager would add**, none needing code or a diagram: an
   ambiguous ticket whose author is offline for eight hours; shipping to production with nobody
   else awake; explaining a cause to support and to a team lead in two registers; reviewing
   somebody else's change when you are not certain. **Recommendation: take the first and the
   fourth.** The bank covers receiving a code review and has nothing on giving one, and "a week
   spent building the wrong thing because nobody asked" is the failure mode remote work actually
   produces.
5. **`dotnet`, `golang` and `ruby-rails` have one question each**, and the blueprint's own rule says
   a variant with one question is a variant we are not really serving. **Recommendation: ask the
   reviewer which of the three this market actually hires for, then give those a second question
   and take the rest off `roles.yaml`.** Offering a variant in the onboarding picker and then
   handing that candidate the general set is worse than not offering it.
6. **Eight untagged questions carry JavaScript snippets** (`db.query`, `app.get`, `res.json`), which
   a Laravel, Spring or Django candidate meets with no warning that the language is not theirs.
   **Recommendation: say so in the prompt** — one clause, "here it is in JavaScript, the idea is the
   same" — rather than rewriting them in pseudocode, which reads as nobody's language.

Also open, from `tasks/todo.md`: the **version-sensitive re-check cycle** (cadence, owner, and
whether a stale mark should warn), and the fact that **backend has no `intern-junior` track** and
**frontend has no `mid` track**, so those candidates get `track_not_found`. Both are lessons work.

## What the skill learned

Four changes to `.claude/skills/question-bank/`, each paid for by a defect in this session:

- **"Name the belief, never the manner."** The descriptor rule added after the frontend stress test
  read "a descriptor that fits a **confident**, specific, wrong answer" — and writing it that way
  put the word *confident* into **34 level-1 descriptors across two banks** before two critique
  passes caught it independently. Every word in a descriptor is a scoring instruction, so that one
  told the evaluator to attend to how an answer sounded: the exact defect `rubrics.shared.yaml` had
  been reworked to remove that same morning. What separates level 1 from level 2 is that level 1
  names a *specific* wrong mechanism and level 2 is vague; a hesitant candidate naming the same
  wrong mechanism has to land in the same band. **A house rule can smuggle back the defect it was
  written to remove.**
- **Two rules became checks in `check-bank.mjs`.** The manner ban is now an error over every
  descriptor, the dimension and the description — the old check covered descriptor 4 only, as a
  warning, which is how the slip got through. And the prompt-clause rule is now a warning with the
  counts: a rubric with three criteria needs a prompt that asks for three things. That rule was the
  frontend pass's best finding, was made a hard rule, and was then **broken eighteen times in the
  next bank by the same drafter**. A rule that has to be remembered once per criterion needs a
  check. The first version of the prompt check was lexical and produced 130 warnings on 80
  questions; counting the asks instead is exact and found 15.
- **Arithmetic is a verification step, not a fact-check.** The two worst defects — naira totals
  drifting over a month, Node hanging on an unhandled rejection — were caught by a critique pass
  doing the sums. A vendor's documentation cannot tell you that a claim about numbers is false.
  `SKILL.md` gains "Check the arithmetic, not only the vendor" with both worked examples, and
  `check-bank.mjs --numbers` prints every quantitative claim (285 today) as the worklist.
- **The stress test keeps paying, and differently each time.** On frontend it changed three
  rubrics. On backend it *proved* something two critique passes had only argued:
  `behavioural-answer-quality` scored a polished story about somebody else's outage at 3.70 —
  identical to the candidate's own break. `incident-you-contributed-to` now has `incident-ownership`.
  **A judgement becomes a defect the moment a mechanical check fails on it.**

## Running it again

```bash
node .claude/skills/question-bank/scripts/check-bank.mjs            # house style, targets, the two new checks
node .claude/skills/question-bank/scripts/check-bank.mjs --numbers  # the arithmetic worklist
node .claude/skills/question-bank/scripts/check-stress.mjs          # 72 rubrics, both separations
pnpm db:seed -- --dry-run                                           # the contract
pnpm --filter @readi/api content:review-doc                         # the pages the expert reads
```

**A local caveat, not a defect:** the dry run reports ten rows as "left alone — published" on this
machine, because they were published in a developer database and this branch edited them. ADR-0014
decision 7 working as designed; a fresh database takes everything, `-- --force` is the way through
on a developer one.

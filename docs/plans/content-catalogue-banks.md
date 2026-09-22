# Question banks from the role catalogue

Plan written 2026-09-22. **Not started — awaiting the owner's decision on the base branch (below).**
Proposed branch: `content/catalogue-banks`.

Builds Readi's question banks from `docs/role-catalogue.md` rather than role by role from scratch, with
an intensive AI improvement pass in front of human review, so a reviewer's time goes to judgement calls
rather than to obvious fixes.

---

## 0. The blocker, first

**The seed format cannot express what this brief asks for, on `main` or on `feat/m2.5-roles` today.**
M2.5 phases 3 and 4 — the ones that make a question's role, level and stack into slugs — are unbuilt.

From `packages/shared-types/src/contracts/seed.ts` as it stands on the current branch:

| The brief needs | The contract says | Consequence |
|---|---|---|
| Questions tagged `fullstack`, `ai-llm`, `devops-cloud`, `mobile` | `roles: z.array(TargetRole).min(1).max(3)` — the closed enum `frontend \| backend \| qa` | No new role's bank validates. No full-stack tagging |
| The M2.5 stack rule (tagged = stack-specific, untagged = general) | `SeedQuestion` has **no `stacks` key** | Stack-specific questions cannot be written at all |
| Level slugs from `levels.yaml` (`intern-junior`) | `levels: z.array(ExperienceLevel).max(2)` — `intern_junior \| mid`, underscore | Two spellings of the same level, and no room for `senior` |
| A track for a new role | `SeedTrack.role: TargetRole`, `level: ExperienceLevel` | No track for full-stack or any wave-2 role |
| Blueprints under `content/seed/blueprints/` | `seed-loader.ts` validates **every `.yaml` under `content/seed`** as a `SeedFile` | Blueprints must be `.md`, not `.yaml` |

`main` is worse than the current branch: it has no `roles.yaml`, `levels.yaml` or `stacks.yaml` at all,
so a blueprint could not name a stack that exists and `supported_question_types` — the rule that decides
which question types a role's M3 interview can deliver — would have nowhere to live.

So **branching from `main`, as the brief says, makes most of the brief unwritable.** Three ways out:

**A — Write in the post-M2.5 target format, off `feat/m2.5-roles`. (Recommended.)**
The target format is already specified in `docs/plans/m2.5-roles-levels-stacks.md` ("`questions.yaml`
gains an optional `stacks: [java-spring]`", slug arrays, `CONTENT_LIMITS.questionRoles: 6`), so there is
nothing to invent. The content is complete and correct the day phase 4 lands; until then it is checked by
a standalone validator written as part of the skill (step 0), not by `pnpm db:seed`.
*Cost:* the files do not import until M2.5 phases 3–4 land. *Risk:* low — the format is written down.

**B — Build M2.5 phases 3 and 4 first, then this pass on top.**
Cleanest: every file importable and validated end to end by `pnpm db:seed -- --dry-run` as it is written.
*Cost:* the largest, most atomic phase of M2.5 lands before any content does.

**C — Stay inside today's format, off `main`.**
Frontend, backend and QA only; `intern_junior | mid`; no stacks, no new roles. Blueprints for everything.
*Cost:* drops full-stack, every stack-specific question and all of Group B — most of the brief.

Everything below assumes **A**. Under B the same work happens in the same order, later. Under C, steps 0
and 1 are unchanged and step 2 shrinks to three roles' general questions.

### Two small code changes this pass needs either way

Content-only otherwise, but two things in the review-doc generator assume three roles and a directory
convention:

1. `apps/api/src/cli/content-review-doc.ts:29-33` treats every subdirectory of `content/seed` as a role,
   so `blueprints/` would generate `review/blueprints.md`. Excluded alongside `review`.
2. `apps/api/src/content/review-doc.ts:202` has a hardcoded `{ frontend, backend, qa }` title map; a new
   role's page would be headed `fullstack`. Replaced by the `name` from `roles.yaml` — which is what
   M2.5 phase 3 plans to do anyway.

---

## 1. Step 0 — the method, as a project skill

`.claude/skills/question-bank/` — so every future role and wave is built the same way to the same
standard, and this pass is the first run of it rather than a one-off.

```
SKILL.md                      the procedure, the house style, the hard rules
templates/blueprint.md        the per-role blueprint
templates/questions.yaml      a commented question + rubric skeleton in house style
references/critique.md        the four critique passes: who each reviewer is, what they look for
references/stress-test.md     the five sample answers, and the eval file they become
references/format.md          the seed format, the M2.5 stack rule, the review workflow
scripts/check-bank.mjs        offline validator: no database, no network
```

`SKILL.md` carries the rules that are not negotiable, each with its source:

- `status: draft` and `author: ai_draft` on every file (`content/seed/README.md`, ADR-0014 decision 6).
- `reviewer_notes` required on every question, saying what the drafter is unsure about — and it is the
  drafter's uncertainty, not a summary of the question.
- Rubric house style: 3 criteria (up to 5), weights totalling exactly 100, five descriptors 0–4 that two
  readers would land on identically.
- **Only question types in that role's `supported_question_types`** (CLAUDE.md §7; M2.5 decision).
- **The stack rule** (M2.5 plan decision 5): no `stacks:` = general to the role; `stacks: [x]` = offered
  only to candidates on that stack. Tag only what is genuinely stack-specific.
- No invented statistics, and no claims about a named company's interview process.
- Never write a question the role's M3 interview cannot deliver — no coding, no system design, no SQL
  surface, no lab.
- Built for the audience: mid-range Android, unreliable mobile data, teams hiring here
  (`content/seed/REVIEW.md`).

`scripts/check-bank.mjs` is what makes the method repeatable before *and* after M2.5 lands. Offline,
no database: slug uniqueness across the corpus; every `topic`, `rubric`, `role`, `level` and `stack`
slug resolves; weights total 100; 3–5 criteria; five descriptors per criterion; `reviewer_notes`
non-empty; `type` ∈ the role's `supported_question_types`; difficulty in 1–5; prompt, context and
ideal-point lengths inside `CONTENT_LIMITS`; and a reconciliation of each bank against its blueprint's
target counts. Once phase 4 lands, `pnpm db:seed -- --dry-run` becomes the second gate, not a
replacement.

---

## 2. Step 1 — a blueprint per role

`content/seed/blueprints/<role>.md` — **markdown, not YAML**, because the seed loader validates every
`.yaml` under `content/seed` as a `SeedFile`.

Each blueprint, derived from that role's catalogue entry:

- **Levels offered** — and which this pass writes for. The catalogue lists `senior` for four roles;
  `levels.yaml` ships `intern-junior` and `mid`, so **senior is recorded and out of scope here**. Adding
  it is a level entry plus its own drafting pass, not a footnote to this one.
- **Stack variants**, from `roles.yaml`, and which of them justify their own questions.
- **Core topics**, marked core or not. Core topics drive readiness coverage (spec §7), so this is a
  claim, not a list.
- **Interview types deliverable in M3 text/voice**, from `supported_question_types`.
- **Rounds that need tooling we do not have** — code editor, SQL surface, diagram surface, lab — named
  explicitly, so the role's page can say what it does not prepare you for rather than oversell.
- **Target counts per level**: general questions, plus a smaller set per stack variant. Proposed, with
  the reasoning; padding to a round number is the failure mode this section exists to prevent.
- **Appendices**, filled as the bank is built: the fact-check log, and what each critique pass changed.

Coverage: **waves 1–3 get a blueprint each (12 roles).** Wave 4 gets one combined
`blueprints/wave-4.md` with a short entry per role — the catalogue gives wave 4 a one-line note each and
no levels, stacks or topics, so a full blueprint would be inventing the data it claims to derive.

### The counts this pass proposes

A bank is credible when a candidate can practise a topic twice without repeating a question, so the
floor is **two questions per core topic per level band**. Frontend's catalogue entry has nine core
topics; the existing bank covers six of them with eight questions, and has nothing at all on
accessibility, frontend testing or debugging.

| Role | General | Stack-tagged | Total | Today |
|---|---|---|---|---|
| Frontend | ~18 | ~10 (2 × 5 stacks) | ~28 | 8 |
| Backend | ~18 | ~14 (2 × 7 stacks) | ~32 | 3 |
| QA | ~16 | ~12 | ~28 | 3 |
| Full-stack | ~8 new boundary + ~20 re-tagged | — | ~28 available | 0 |
| AI/LLM engineer | ~18 | ~6 | ~24 | 0 |
| DevOps / Cloud | ~18 | ~10 | ~28 | 0 |
| Mobile | ~18 | ~8 | ~26 | 0 |

**≈ 160 new questions and ≈ 140 new rubrics.** That is a large pass and it should be read as one. Two
consequences worth deciding now rather than discovering later:

- **A reviewer will not read 82 questions in one sitting.** So the first expert round per role goes out
  as the **general, core-topic questions only**; the stack-tagged set is round two. The review page is
  regenerated for each round.
- **The stress test is the cost driver**: five sample answers per question is ~800 answers across both
  groups. Cheaper and, I think, better: **five per rubric**, written against the question that rubric
  belongs to, because the rubric is what is being tested. Shared rubrics (the behavioural one) get one
  set per role rather than one per question. Owner's call — flagged in the questions below.

---

## 3. Step 2 — Group A (launch): frontend, backend, QA, full-stack

Stops for review. **Recommended: stop after each role, not after the group** — four roles and ~82 new
questions is not one reviewable unit. The brief says stop after the group; this is the one place I would
deviate, and only with the owner's agreement.

- **Frontend** — improve the existing eight (they are the standard the others are brought up to, and two
  of them have known weaknesses their own `reviewer_notes` admit), fill the three uncovered core topics,
  extend to mid, add stack questions for the five variants.
- **Backend** — three questions to a full bank. The thinnest of the three today, and the role the
  catalogue calls the most-requested hire.
- **QA** — three to a full bank. The catalogue's best engine fit ("Full"), so it is the one role where
  the bank alone is the whole product.
- **Full-stack** — no new bank. A `fullstack` entry in `roles.yaml` with its levels and stacks, a second
  role tag on the frontend and backend questions that genuinely transfer, a `track.yaml`, and only the
  boundary questions neither side covers: where logic belongs, data flow across the boundary, deploying
  a whole feature, working without a specialist beside you.

New topics are added to `topics.yaml` as the banks need them (backend depth, QA, and later AI/LLM,
DevOps, mobile). A topic is shared across roles by design.

## 4. Step 3 — Group B (wave 2): AI/LLM engineer, then DevOps/Cloud, then Mobile

Complete banks drafted from their blueprints, in the owner's order. Each needs its role, stacks and
topics added to the catalogue files first.

**Data analyst: blueprint only, no bank.** Its launch gate — a SQL practice surface — is not met, and
the catalogue is explicit that text-only analyst prep would promise what it cannot deliver (product
principle 1). The blueprint says so on its face.

## 5. Waves 3 and 4 — blueprints only

Twelve roles' worth of planning, no content. Their banks come later, through the skill.

---

## 6. The improvement pass, per question and rubric (Groups A and B)

Applied to everything in Groups A and B, including the eight questions that already exist.

**1. Four critique passes, run separately** (parallel subagents, one perspective each, per the owner's
global working agreement on subagent use):

| Pass | Asks |
|---|---|
| Senior interviewer at a Nigerian company | Would I ask this, at this level, of someone I might hire here? |
| Hiring manager abroad hiring remote Nigerian developers | Does a strong answer here predict someone who works out on my team? |
| Nervous junior candidate | Do I understand what is being asked? Does it feel like a trap? |
| Fairness reviewer | Hierarchy norms (does it punish someone whose workplace forbids disagreeing upward?), jargon, assumed access to expensive tools, assumed kinds of prior experience |

Each returns findings against named slugs. Findings are applied as edits, or recorded in
`reviewer_notes` when they are a judgement an expert should make. The fairness pass has teeth already:
`pushing-back-on-a-release` and `stuck-and-asked-for-help` both carry exactly this worry in their own
notes today.

**2. Fact-check every technical claim** against current official documentation — MDN, React, the
framework and tool docs — and flag anything version-sensitive or aged in `reviewer_notes` with what was
checked and when. Logged per role in the blueprint appendix.

**3. Rubric stress test.** Five sample answers per rubric: strong · weak · fluent but wrong · correct
but poorly explained · correct in Nigerian English phrasing. Score each against the rubric. **A rubric
that cannot separate "fluent but wrong" from "strong", or "correct but poorly explained" from "weak", is
a defect and gets sharpened** — that pairing is the whole point of the exercise, and the fifth answer
exists so that the rubric is caught rewarding accent and idiom rather than content.

They become the M4 starter set: `evals/datasets/synthetic/<role>/<rubric-slug>.yaml`, with the expected
per-criterion score for each answer, plus a README stating plainly that these are **model-written and
model-scored** — a regression baseline and a rubric test, **not** the human-scored gold set the M4
agreement metric needs (CLAUDE.md §3, "Gold-standard answers with human scores").

**4. Tagging.** Stack-specific questions carry `stacks:`; general ones carry none (M2.5 decision 5). The
test is whether the question would be unfair or meaningless to a candidate on another stack — not
whether it happens to mention a library.

**5. Coverage.** After drafting, each bank is compared to its blueprint and to what a real junior/mid
interview for that role covers, and the remaining gaps are listed — including gaps that cannot be closed
until the tooling exists.

---

## 7. What is produced

```
.claude/skills/question-bank/…              the method
content/seed/blueprints/<role>.md           12 blueprints + wave-4.md
content/seed/roles.yaml                     + fullstack, ai-llm, devops-cloud, mobile, data-analyst
content/seed/stacks.yaml                    + the new roles' variants
content/seed/topics.yaml                    + topics the new banks hang from
content/seed/<role>/{track,rubrics,questions}.yaml     Group A and Group B banks
content/seed/review/<role>.md               regenerated, one per role, for that role's reviewers
evals/datasets/synthetic/<role>/*.yaml      the stress-test answers, with a README that does not overclaim
docs/plans/content-catalogue-banks.md       this plan, kept current
tasks/todo.md, tasks/lessons.md             working state and corrections
```

## 8. Verification

```bash
node .claude/skills/question-bank/scripts/check-bank.mjs        # every gate above, offline
pnpm --filter @readi/api content:review-doc                     # regenerates every role's page
pnpm lint && pnpm typecheck                                     # the two review-doc changes
pnpm test --filter @readi/api -- seed-loader                    # once the format lands (option A)
pnpm db:seed -- --dry-run                                       # the real gate, after M2.5 phase 4
```

And at each stop, per role: question counts by level and stack, what changed and why, the gaps that
remain, and the short list of questions I most want a human expert to look at.

## 9. Risks

- **The content outruns the engine.** Under option A the files are correct and unimportable until M2.5
  phases 3–4 land. Mitigated by the offline validator and by the format being already specified.
- **Volume swamps review.** ~160 questions is more than any reviewer reads at once. Mitigated by
  role-level stops and by sending general questions in round one, stack-tagged in round two.
- **Four AI critique passes are still one model.** They reduce obvious defects; they do not substitute
  for the expert, and nothing here changes `author: ai_draft` or the production publish guard
  (ADR-0014 decision 6). The measure of success is that the expert's notes are about judgement, not
  typos and stale versions.
- **Stack questions age fastest.** Framework idiom moves; the fact-check log and `reviewer_notes` name
  what is version-sensitive so the next pass knows where to look first.

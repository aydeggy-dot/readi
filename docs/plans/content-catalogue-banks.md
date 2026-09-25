# Question banks from the role catalogue

Plan written 2026-09-22. **Started 2026-09-22 on `content/catalogue-banks`, branched from `main`
after M2.5 merged (`00daa6f`).** Stop 1 — the method and the blueprints — is delivered; no question
has been drafted yet.

Builds Readi's question banks from `docs/role-catalogue.md` rather than role by role from scratch,
with an intensive AI improvement pass in front of human review, so a reviewer's time goes to
judgement calls rather than to obvious fixes.

---

## 0. The blocker, and how it resolved

The first version of this plan opened with a blocker: the seed format could not express what the
brief asked for, because M2.5 phases 3 and 4 — the ones that make a question's role, level and stack
into slugs — were unbuilt. It offered three ways out and recommended writing in the post-M2.5 target
format off the feature branch.

**M2.5 merged on 2026-09-22, so none of that applies.** `main` now carries the whole catalogue:
`roles.yaml` with four roles including `fullstack`, `levels.yaml` (`intern-junior`, `mid`, and a
`senior` no role offers), `stacks.yaml` with 23 variants, and a `SeedQuestion` whose `roles`,
`levels` and `stacks` are all slug arrays. The content is written in the final format and imports on
the day it is written: `pnpm db:seed -- --dry-run` is a real gate from the first question, not a
later one.

**The two code changes the plan reserved were also made in M2.5 and need nothing here.**
`content-review-doc.ts` now derives the roles it writes pages for from `roles.yaml` intersected with
the directories that hold content, so `blueprints/` produces no page; and the hardcoded
`{ frontend, backend, qa }` title map is gone, replaced by the `name` on the catalogue row.

Blueprints are still **markdown**, because the seed loader validates every `.yaml` under
`content/seed` as a seed file. Proven, not assumed: `pnpm db:seed -- --dry-run` reads 14 files with
the 14 blueprint pages sitting beside them.

## 0.1 The owner's decisions

| Question | Decision (2026-09-22) |
|---|---|
| Where to stop | **After the skill and the blueprints, then after each role.** Not after each group: ~82 new Group A questions is not one reviewable unit, and a wrong house style caught at stop 1 costs one role to redo instead of four. |
| How wide the rubric stress test runs | **Five sample answers per rubric**, written against the question that rubric belongs to — not five per question. The rubric is the thing under test. Shared rubrics get one set per role. |

Earlier decisions this plan inherits: launch content is frontend, backend, QA and full-stack; data
analyst is wave 2 and **does not launch until there is a SQL practice surface**; AI/LLM engineer
leads wave 2, ahead of DevOps and Mobile.

---

## 1. Step 0 — the method, as a project skill · **done**

`.claude/skills/question-bank/` — so every future role and wave is built the same way to the same
standard, and this pass is the first run of it rather than a one-off.

```
SKILL.md                      the procedure, the house style, the hard rules
templates/blueprint.md        the per-role blueprint, including the `targets` block
templates/questions.yaml      a commented question + rubric skeleton in house style
references/critique.md        the four critique passes: who each reviewer is, what they look for
references/stress-test.md     the five sample answers, and the eval files they become
references/format.md          the seed format, the stack rule, the review workflow, the traps
scripts/check-bank.mjs        offline validator: no database, no network, no build
```

`SKILL.md` carries the rules that are not negotiable, each with its source: `status: draft` and
`author: ai_draft`; `reviewer_notes` as the drafter's uncertainty rather than a summary; 3–5
criteria with weights totalling 100 and five descriptors two readers would land on identically; only
question types in that role's `supported_question_types`; the stack rule (no tags = general, tags =
narrowed to those variants); no invented statistics and no claims about a named company's process;
never a question the engine cannot deliver; and written for mid-range Android on unreliable data.

`scripts/check-bank.mjs` deliberately does **not** re-implement the seed contract — that is
`packages/shared-types/src/contracts/seed.ts`, and `pnpm db:seed -- --dry-run` is how you consult
it. It checks what the contract cannot: house style tighter than the contract allows, descriptors
that are present and distinguishable, a question's `type` against every listed role's
`supported_question_types`, its levels and stacks against what those roles actually offer, cross-file
slug resolution without a database, and **the bank against its blueprint's targets**. The length
limits it enforces are read out of `packages/shared-types/src/constants.ts` at run time rather than
copied, so they cannot drift.

It already found three things in the 14 existing questions, reported every run:

- `async-ordering-understanding`, criterion 1, descriptor 4 rewards saying the answer **confidently**
  — the canonical rubric defect, and exactly what the fairness pass and the stress test exist to catch.
- **Five of the eight role × level combinations have no track**: frontend at mid, backend at
  intern-junior, QA at mid, full-stack at both. Those candidates get `track_not_found`.
- `react-state` has **no general question at all** — both of its questions are React-tagged, so a
  Vue, Angular or vanilla candidate practises nothing about where state lives.

---

## 2. Step 1 — a blueprint per role · **done**

`content/seed/blueprints/` — 12 role blueprints (waves 1–3) plus `wave-4.md` and a `README.md`
index. Each derives, from the role's catalogue entry: the levels offered and which this pass writes
for; the stack variants and which justify their own questions; the core topics, marked core, with
what they reuse from the existing taxonomy; the interview types the engine can deliver and the
rounds that need tooling we do not have; and **target counts derived topic by topic**, not padded.

Wave 4 is one combined page with a short entry per role, because the catalogue gives those eight a
one-line note each and a full blueprint would be inventing the data it claims to derive.

Each blueprint carries a machine-readable `targets` block, **per level**:

```yaml
general_by_topic:
  javascript-fundamentals: { intern-junior: 2, mid: 2 }
by_stack:
  react-typescript: 3
complete: false
```

Per level, because "two questions on this topic" means nothing to a candidate who can only be asked
one of them. `complete: true` — or `--strict` — turns a shortfall from a warning into an error.

### The floor, and the counts it produces

A bank is credible when a candidate can practise a topic twice without repeating a question, so the
floor is **two questions per core topic, available at each level the role offers**. A question
carrying both levels fills a slot in each. Deviations are stated with a reason (concurrency at
junior, system design at junior, release-and-store at junior) rather than quietly applied.

| Role | General | Stack-tagged | Total | Today |
|---|---|---|---|---|
| Frontend | ~20 | ~11 | ~31 | 8 |
| Backend | ~22 | ~12 | ~34 | 3 |
| QA | ~21 | ~9 | ~30 | 3 |
| Full-stack | ~8 own + ~35 borrowed | — | ~43 available | 11 borrowed |
| AI/LLM engineer | ~19 | ~6 | ~25 | 0 |
| DevOps / Cloud | ~22 | ~6 | ~28 | 0 |
| Mobile | ~21 | ~9 | ~30 | 0 |
| Data analyst | ~18 | ~9 | ~27 | **blocked on a SQL surface** |

**Group A is ≈ 103 new questions and ≈ 86 new rubrics** (frontend, backend, QA, full-stack). That is
larger than the first estimate because the counts are now derived per topic per level rather than
guessed, and because backend and QA turned out to need seven and six new topics respectively.

Two consequences, both already decided: the first expert round per role goes out as the **general,
core-topic questions only** and the stack-tagged set is round two; and the pass **stops after each
role**.

### What the blueprints found that the plan did not know

- **No backend question is offered at intern-junior.** All three are `mid`, so a junior backend
  candidate's practice is two shared behavioural questions. The largest content hole in wave 1.
- **A full-stack candidate never sees a frontend or backend variant question** unless it is tagged
  with a full-stack variant too, because a profile holds one `target_stack` and `laravel-vue` is not
  `php-laravel`. M2.5 solved this for the two React questions by tagging them `react-node`; the rule
  is now written down for every stack-tagged question in both banks.
- **Three roles' catalogue "stacks" are topics, not variants.** AI/LLM lists vector stores and agent
  frameworks, DevOps lists Terraform and CI tooling, and QA's `manual-exploratory` is the absence of
  a technology. Tagging those would hide the material from the candidates who most need it. Each
  blueprint proposes the deviation and says what it costs to overrule.
- **The frontend track and the catalogue disagree** about whether accessibility and frontend testing
  are core. The track says no, which is what feeds readiness coverage (spec §7). The blueprint
  recommends yes, and it is one boolean each.
- **Topic reuse is the main economy of scale.** `observability` serves backend, AI/LLM and DevOps;
  `networking` serves DevOps, cybersecurity and support; `incident-response` serves DevOps and
  cybersecurity; `metric-definition` serves the analyst and the TPM. Waves 2 and 3 add far fewer
  topics than roles.

---

## 3. Step 2 — Group A (launch): frontend, backend, QA, full-stack

**Stops after each role.** In order:

- **Frontend — done 2026-09-22, with the owner.** 8 questions to 34 (23 general, 11 stack-tagged),
  28 new rubrics, four critique passes and the fact-check. The three things worth carrying to the
  other roles: **every criterion must have a clause in the spoken prompt that asks for it** (nine
  questions charged a third of the score for something never requested); **assume no employer**
  (two questions were unanswerable for a self-taught candidate); and **a shared rubric must be able
  to score its questions** — the shared behavioural one could not, which three of the four passes
  found independently. All three are now rules in `SKILL.md`. Two role-general questions were added
  from the passes, `the-overnight-blocker` and `something-you-built`, and the second of each belongs
  in the backend pass.
- **Backend** — three questions to a full bank, and the junior level from zero. Seven new topics.
- **QA — done 2026-09-23.** 3 questions to 35 (25 general, 10 stack-tagged), 33 rubrics, six new
  topics, 165 stress answers. Handover: `docs/progress/2026-09-23-qa-bank.md`. The two findings that
  reach beyond this bank: **the weights were a template, not a claim** (21 of 30 rubrics identical,
  against 11 and 12 distinct patterns in the other two banks — now a check), and **`qa/rubrics.yaml`
  carried none of the protective clauses the shared file has eleven of**, because the bank's fairness
  promise was in a YAML comment the evaluator never reads. The open question for the owner is the
  **triple-barrelled prompt**: two passes say it pre-empts the engine's own follow-ups, and the
  prompt-clause rule says every criterion needs a clause — that conflict changes every bank and was
  deliberately not resolved inside this one.
- **Full-stack** — no new bank: a skeleton `track.yaml`, the second role tag on everything that
  transfers, the full-stack variant tag on every stack question that transfers, and the ~8 boundary
  questions neither side covers.

New topics are added to `topics.yaml` as the banks need them, in the same change as the questions
that hang from them. A topic is shared across roles by design.

## 4. Step 3 — Group B (wave 2): AI/LLM engineer, then DevOps/Cloud, then Mobile

Complete banks drafted from their blueprints, in the owner's order. Each needs its role, stacks and
topics added to the catalogue files first, and each blueprint already names them.

**Data analyst: blueprint only, no bank** — its launch gate, a SQL practice surface, is not met, and
specifying it is the first task of the analyst wave rather than an afterthought at the end of it.

## 5. Waves 3 and 4 — blueprints only · **done**

Four wave-3 blueprints and one combined wave-4 page. Their banks come later, through the skill.

---

## 6. The improvement pass, per question and rubric (Groups A and B)

Applied to everything in Groups A and B, including the eight questions that already exist.

**1. Four critique passes, run separately** (parallel subagents, one perspective each): a senior
interviewer at a Nigerian company; a hiring manager abroad hiring remote Nigerian developers; a
nervous junior candidate; a fairness reviewer. Briefs, and what each looks for, are
`.claude/skills/question-bank/references/critique.md`. Findings come back against named slugs and
are either applied as edits or recorded in `reviewer_notes` when they are a judgement an expert
should make. The counts go in each blueprint's Appendix B.

**2. Fact-check every technical claim** against current official documentation, flagging anything
version-sensitive in `reviewer_notes` with what was checked and when. Logged per role in Appendix A.
The AI/LLM bank carries an extra rule for this reason: no model names, no prices, no context-window
sizes, no benchmark numbers anywhere in a question or a rubric.

**3. Rubric stress test — five sample answers per rubric** (owner's decision): strong · weak ·
fluent but wrong · correct but poorly explained · correct in Nigerian English. Score each against
the rubric. **A rubric that cannot separate "fluent but wrong" from "strong", or "correct but poorly
explained" from "weak", is a defect and gets sharpened.** The fifth answer exists so that a rubric
rewarding accent and idiom rather than content is caught.

They become the M4 starter set at `evals/datasets/synthetic/<role>/<rubric-slug>.yaml`, with a
README stating plainly that these are **model-written and model-scored** — a regression baseline and
a rubric test, **not** the human-scored gold set the M4 agreement metric needs.

**4. Tagging.** Stack-specific questions carry `stacks:`; general ones carry none. The test is
whether the question would be unfair or meaningless to a candidate on another stack — not whether it
happens to mention a library. Plus the full-stack variant rule above.

**5. Coverage.** Each bank is compared to its blueprint (`check-bank.mjs --strict`) and to what a
real junior or mid interview for that role covers, with the remaining gaps listed in Appendix C —
including the ones that cannot close until the tooling exists.

---

## 7. What is produced

```
.claude/skills/question-bank/…              the method                            [done]
content/seed/blueprints/*.md                12 blueprints + wave-4.md + README    [done]
content/seed/roles.yaml                     + ai-llm, devops-cloud, mobile, …     [wave 2]
content/seed/stacks.yaml                    + the new roles' variants             [wave 2]
content/seed/topics.yaml                    + topics the new banks hang from      [Group A]
content/seed/<role>/{track,rubrics,questions}.yaml     Group A and Group B banks
content/seed/review/<role>.md               regenerated, one per role, for that role's reviewers
evals/datasets/synthetic/<role>/*.yaml      the stress-test answers, with a README that does not overclaim
docs/plans/content-catalogue-banks.md       this plan, kept current
tasks/todo.md, tasks/lessons.md             working state and corrections
```

## 8. Verification

```bash
node .claude/skills/question-bank/scripts/check-bank.mjs            # offline: house style, slugs, blueprints
node .claude/skills/question-bank/scripts/check-bank.mjs --strict   # shortfalls become errors
pnpm db:seed -- --dry-run                                           # the contract, against the database
pnpm --filter @readi/api content:review-doc                         # regenerates every role's page
pnpm format && pnpm lint && pnpm typecheck
```

And at each stop, per role: question counts by level and stack, what changed and why, the gaps that
remain, and the short list of questions I most want a human expert to look at.

## 9. Risks

- **Volume swamps review.** ~103 new questions in Group A is more than any reviewer reads at once.
  Mitigated by stopping after each role and by sending general questions in round one, stack-tagged
  in round two.
- **Four AI critique passes are still one model.** They reduce obvious defects; they do not
  substitute for the expert, and nothing here changes `author: ai_draft` or the production publish
  guard (ADR-0014 decision 6). The measure of success is that the expert's notes are about
  judgement, not typos and stale versions.
- **The blueprints' variant deviations are arguments, not evidence.** Three of them overrule the
  catalogue about what is a variant and what is a topic. Each says what it costs to overrule back.
- **Stack questions age fastest**, and the AI/LLM bank fastest of all. The fact-check log and
  `reviewer_notes` name what is version-sensitive so the next pass knows where to look first.
- **Content still outruns lessons.** Five of eight role × level combinations have no track, and this
  pass does not write them — it only names them, every time the checker runs.

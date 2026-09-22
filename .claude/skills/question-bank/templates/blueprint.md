# <Role name> — question bank blueprint

> Template. Copy to `content/seed/blueprints/<role>.md`, delete this line and every angle bracket.
> Derived from `docs/role-catalogue.md`; where this disagrees with the catalogue, say so and say why.
>
> **Wave <n>.** <Status: planning only / drafting / drafted, in review.>

## What the role is

<One paragraph. What they are hired to do here, and what an interview for it is trying to find out.>

## Levels

| Level         | Offered by the role                      | Written in this pass | Why                                                                                                 |
| ------------- | ---------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| intern-junior | yes                                      | yes                  |                                                                                                     |
| mid           | yes                                      | yes                  |                                                                                                     |
| senior        | no — the level exists, no role offers it | no                   | System design, and rubric dimensions the junior/mid rubrics do not contain. `levels.yaml` says why. |

## Stack variants

| Variant | Offered | Own questions | Why                                                                                 |
| ------- | ------- | ------------- | ----------------------------------------------------------------------------------- |
| <slug>  | default | 2             |                                                                                     |
| <slug>  | yes     | 0             | <Named, not padded: what a question here would test that the general set does not.> |

## Core topics

Core topics drive readiness coverage (spec §7), so this is a claim, not a list.

| Topic slug    | Core | In `topics.yaml` | Today | Target | Why this number             |
| ------------- | ---- | ---------------- | ----- | ------ | --------------------------- |
| <slug>        | yes  | yes              | 1     | 3      |                             |
| <slug>        | yes  | **new**          | 0     | 2      |                             |
| collaboration | no   | yes              | 2     | 2      | Behavioural, shared rubric. |

**New topic rows this bank needs:** <slugs, or none.>

## What the engine can deliver

`supported_question_types` for this role is `<types>`, so this bank contains those and nothing else.

| Round a real interview has    | Can we?                           | Consequence                                                    |
| ----------------------------- | --------------------------------- | -------------------------------------------------------------- |
| <e.g. "build this component"> | **No** — needs a code editor (P2) | The role's page must say the bank does not prepare you for it. |

## Target counts

<The derivation, in prose: topics × the floor of two per core topic per level, plus where a third is
earned and why. Then the machine-readable block, which `check-bank.mjs` reconciles the bank against.>

```yaml
# targets (read by check-bank.mjs)
role: <slug>
levels: [intern-junior, mid]
# General questions — no `stacks:` key, so every candidate for the role is asked them.
# Per level, because "two questions on this topic" means nothing to a candidate who can only be
# asked one of them. One question carrying both levels fills a slot in each.
general_by_topic:
  <topic-slug>: { intern-junior: 2, mid: 3 }
  <topic-slug>: { intern-junior: 2, mid: 2 }
# Stack-tagged questions, counted per variant. A question tagged for two variants counts for both.
by_stack:
  <stack-slug>: 2
# Set true when the bank is meant to satisfy these numbers; --strict then fails on a shortfall.
complete: false
```

|        | General | Stack-tagged | Total | Today |
| ------ | ------- | ------------ | ----- | ----- |
| <Role> |         |              |       |       |

## Out of scope, deliberately

<Senior. Rounds that need tooling. Variants that do not justify their own questions. Anything the
catalogue lists that this pass is not writing — named here so it is a decision, not an omission.>

---

## Appendix A — fact-check log

<Filled as the bank is drafted. One row per technical claim checked against current official
documentation, with what was checked, against what, and when.>

| Question | Claim | Checked against | Date | Outcome |
| -------- | ----- | --------------- | ---- | ------- |

## Appendix B — what the critique passes changed

<Filled after `references/critique.md`. One line per pass: findings, applied, moved to
`reviewer_notes`. Then the findings worth remembering.>

| Pass                         | Findings | Applied | To `reviewer_notes` |
| ---------------------------- | -------- | ------- | ------------------- |
| Senior interviewer (Nigeria) |          |         |                     |
| Hiring manager (remote)      |          |         |                     |
| Nervous junior               |          |         |                     |
| Fairness                     |          |         |                     |

## Appendix C — coverage after drafting

<The bank against this blueprint, and against what a real interview for the role covers. The gaps
that remain, including the ones that cannot close until the tooling exists.>

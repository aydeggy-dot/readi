# Full-stack engineer — question bank blueprint

**Wave 1. Status: blueprint drafted 2026-09-22; 11 borrowed questions, no track, no boundary
questions yet.** Derived from `docs/role-catalogue.md` § Full-stack Engineer — _added 2026-09-22_.

## What the role is

Owns a feature end to end: the most advertised title in Nigerian job posts and the default shape of
a startup hire. An interview for it is trying to find out whether the candidate can hold both sides
at once — whether they know where a rule belongs, what the client is entitled to assume, and what
happens to the whole feature when they ship it.

**It has no bank of its own and should not get one.** It is made of the frontend and backend
questions that genuinely transfer, each carrying `fullstack` as a second role, plus the small set of
questions neither side asks.

## Levels

| Level         | Offered | Written in this pass | Notes                                                                              |
| ------------- | ------- | -------------------- | ---------------------------------------------------------------------------------- |
| intern-junior | yes     | yes                  | **No track.** A full-stack candidate at either level gets `track_not_found` today. |
| mid           | yes     | yes                  | Also no track.                                                                     |
| senior        | no      | no                   |                                                                                    |

**Recommendation: one skeleton track at `intern-junior`**, in the shape of `backend/track.yaml` —
one module, two lessons, the topics marked core. The reasoning: the junior full-stack hire is the
role's real audience here, and it is the level where "where does this logic belong" is genuinely
not obvious. Mid follows when the boundary lessons are written properly. This is a judgement call
and the owner should overrule it if the mid track matters more.

A second thing the track cannot fix: **the junior full-stack question set is lopsided today**,
because every backend question is `mid` and most frontend questions are `intern-junior`. A junior
full-stack candidate currently practises frontend with a behavioural round attached. Backend's
junior questions (see `backend.md`) fix that, and they fix it for this role too.

## Stack variants — and the trap in them

Six, from `roles.yaml`: `react-node` _(default)_, `nextjs`, `django-react`, `laravel-vue`,
`ruby-rails`, `dotnet-react`. Two of them — `nextjs` and `ruby-rails` — are the same rows frontend
and backend already offer, because a stack belongs to as many roles as offer it.

**The trap: a full-stack candidate never sees a frontend or backend variant question unless it is
tagged with a full-stack variant too.** A candidate's profile holds one `target_stack`. Someone
preparing for full-stack on `laravel-vue` is not on `php-laravel` and not on `vue-nuxt`, so every
question tagged for those is invisible to them — they get the general set and nothing else. M2.5 hit
this already and solved it the right way: the two React questions carry `react-typescript, nextjs,
react-node` together.

So the rule for every stack-tagged question in the frontend and backend banks:

> **If a full-stack interview would ask it, tag it with the matching full-stack variant as well.**
> `react-typescript`/`nextjs` → also `react-node`. `php-laravel` + Vue → also `laravel-vue`.
> `python-backend` + React → also `django-react`. `dotnet` + React → also `dotnet-react`.
> `ruby-rails` is one row and needs nothing.

| Variant                  | Target | Mostly from                                                            |
| ------------------------ | ------ | ---------------------------------------------------------------------- |
| `react-node` _(default)_ | 3      | Frontend React questions and backend Node questions that transfer      |
| `nextjs`                 | 3      | The same, plus the genuinely-Next.js questions `frontend.md` calls for |
| `django-react`           | 2      | Backend Python questions that transfer                                 |
| `laravel-vue`            | 2      | Backend PHP and frontend Vue questions that transfer                   |
| `ruby-rails`             | 2      | Backend Rails questions carrying the `fullstack` role                  |
| `dotnet-react`           | 1      | Narrowest of the six here                                              |

## Core topics

The frontend and backend core topics, through the questions that carry `fullstack`, **plus** the
four the catalogue names as the role's own. Those four fold into two new topics and one existing one:

| Topic slug           | Core | In `topics.yaml` | Covers                                                                                                       | Today (ij / mid) | Target (ij / mid) |
| -------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------- |
| `fullstack-boundary` | yes  | **new**          | Where the logic belongs; validation on both sides; data flow across the boundary; what the client may assume | 0 / 0            | 2 / 3             |
| `deployment-basics`  | yes  | **new**          | Shipping a whole feature: configuration, migrations, what to do when only half of it deployed                | 0 / 0            | 2 / 2             |
| `collaboration`      | yes  | yes              | Working without a specialist beside you — a new subtopic on this topic, not a new topic                      | 3 / 2            | 2 / 2             |

`fullstack-boundary` earns three at mid rather than two because it is the only thing that
distinguishes this role from doing both others badly, and one question on it is not a round.

**New topic rows this bank needs:** `fullstack-boundary`, `deployment-basics`.

The frontend and backend core topics are **not** repeated in the targets block. They are covered by
transfer, and reconciling them here would double-count the same questions against two blueprints.

## What the engine can deliver

`supported_question_types` is `technical, scenario, behavioral` — the same as frontend and backend,
and the same two missing rounds (live coding, system design). The boundary questions are mostly
`scenario`: "the form saves but the list does not update", "the price is right on the screen and
wrong in the database", "you deployed the API and forgot the migration".

## Target counts

Nine general slots on the two new topics, all empty: **about 8 new questions** — the boundary
questions the plan named, which is the whole of this role's own bank.

The rest of the work is **tagging, not writing**: as the frontend and backend banks grow, each new
question is asked "would a full-stack interview ask this?" and carries the second role when the
answer is yes. Expect roughly two thirds of them to. Eleven do today.

```yaml
# targets (read by check-bank.mjs)
role: fullstack
levels: [intern-junior, mid]
general_by_topic:
  fullstack-boundary: { intern-junior: 2, mid: 3 }
  deployment-basics: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  react-node: 3
  nextjs: 3
  django-react: 2
  laravel-vue: 2
  ruby-rails: 2
  dotnet-react: 1
complete: false
```

|            | Own new questions | Borrowed                    | Available | Today |
| ---------- | ----------------- | --------------------------- | --------- | ----- |
| Full-stack | ~8                | ~35 as the other banks grow | **~43**   | 11    |

About 7 new rubrics — the boundary questions, less the behavioural one.

## Out of scope, deliberately

- **A bank of its own.** Copying frontend and backend questions would make two things that drift.
- **Senior**, and a `mid` track for now.
- **Re-tagging every question.** A wrong "yes" wastes a full-stack candidate's practice on something
  they will never be asked; the question in `content/seed/REVIEW.md` §6 asks the expert exactly this,
  per question.

---

## Appendix A — fact-check log

_Filled as the boundary questions are drafted._

| Question | Claim | Checked against | Date | Outcome |
| -------- | ----- | --------------- | ---- | ------- |

## Appendix B — what the critique passes changed

| Pass                         | Findings | Applied | To `reviewer_notes` |
| ---------------------------- | -------- | ------- | ------------------- |
| Senior interviewer (Nigeria) |          |         |                     |
| Hiring manager (remote)      |          |         |                     |
| Nervous junior               |          |         |                     |
| Fairness                     |          |         |                     |

## Appendix C — coverage after drafting

_Filled at the end of the role's pass, including the re-tagging decision for every frontend and
backend question._

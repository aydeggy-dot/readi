# Full-stack engineer — question bank blueprint

**Wave 1. Status: blueprint drafted 2026-09-22; tagging pass done 2026-09-25 — 64 borrowed
questions, still no track and no boundary questions.** Derived from `docs/role-catalogue.md`
§ Full-stack Engineer — _added 2026-09-22_. Appendix C has the tagging audit;
`docs/progress/2026-09-25-fullstack-tagging.md` is the handover.

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
answer is yes. **64 do today** (Appendix C). The drafting estimate here was "roughly two thirds";
in the event every general frontend and backend question transferred and the only reason to say no
was a stack this role does not offer.

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

|            | Own new questions | Borrowed                  | Available | Today |
| ---------- | ----------------- | ------------------------- | --------- | ----- |
| Full-stack | ~8                | 64 across the three banks | **~72**   | 64    |

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

## Appendix C — the tagging pass (2026-09-25)

Held since 2026-09-22 so that it would inherit whatever the three banks ended up carrying, and run
once at the end rather than three times. **64 of the 104 questions in the three banks are offered to
a full-stack candidate** — 31 of frontend's 35, 31 of backend's 34, 2 of QA's 35 — against 11 when
this blueprint was written.

### The frontend and backend banks: nothing to re-tag

Both banks were drafted with the second role applied question by question, so this pass was an audit
rather than a change. **Every question that is general to its role already carries `fullstack`.** The
seven that do not are stack-tagged for a variant this role does not offer, so no full-stack candidate
could ever be asked them whatever we decided:

| Question                                                            | Stack            | Full-stack counterpart                   |
| ------------------------------------------------------------------- | ---------------- | ---------------------------------------- |
| `angular-subscription-leak`, `angular-view-did-not-update`          | `angular`        | none                                     |
| `vanilla-clicks-on-new-items`, `vanilla-dom-as-the-source-of-truth` | `vanilla-js`     | none                                     |
| `spring-transaction-did-not-roll-back`, `spring-default-error-body` | `java-spring`    | none                                     |
| `python-blocking-call-in-async`                                     | `python-backend` | `django-react` — **declined**, see below |

**The blueprint's own estimate was wrong, and it is worth saying which way.** It expected "roughly
two thirds" to transfer; in the event the only reason to say no turned out to be the stack, not the
subject. That is not over-tagging so much as a fact about this role: it is the broadest of the four,
and a general frontend or backend question that a full-stack interview would _not_ ask is hard to
construct. `content/seed/REVIEW.md` §7 now puts that to the expert as the question it is.

**The stack-variant rule is fully applied.** All thirteen stack-tagged questions carrying `fullstack`
reach at least one of this role's six variants, which is the trap this blueprint was written to
avoid. Reach per variant: `nextjs` 8, `react-node` 6, `laravel-vue` 4, `django-react` 1,
`ruby-rails` 0, `dotnet-react` 0.

**`python-blocking-call-in-async` was the one candidate for a re-tag, and it was declined.** Adding
`django-react` would take that variant from 1 of 2 to 2 of 2 and close a target by tagging — but the
snippet is `@app.get`, FastAPI-shaped, and the drafter had already flagged in `reviewer_notes`
whether `python-backend` covering Django and FastAPI at once is a stretch. Putting a FastAPI snippet
in front of a candidate preparing for Django + React is exactly the unfairness the stack rule
exists to prevent. The three variant shortfalls — `django-react` 1 of 2, `ruby-rails` 0 of 2,
`dotnet-react` 0 of 1 — are a **writing** gap, and `check-bank.mjs` reports all three every run.

### The QA bank: two crossed over, and why only two

No QA question carried `fullstack` before this pass. The owner's brief was to consider whether one or
two testing-mindset questions should. Two did:

- **`what-to-test-when-there-is-no-time`** (scenario, `risk-based-testing`, both levels) — deciding
  what to check when there is no time to check everything. It is the only risk-prioritisation
  question in any bank, and it is the testing judgement a developer who ships their own feature most
  needs. Its rubric is role-neutral: impact against likelihood, a list with a cut line, and saying
  plainly what was not covered.
- **`where-your-test-data-comes-from`** (scenario, `test-data`, both levels) — in a small team the
  person offered a copy of the production database is the developer setting up their own
  environment, not a tester. Nothing in either bank asks about personal data in a test environment,
  and the NDPA makes it a question this product should be asking. One word in
  `test-data-judgement` moved with it: level 1 of criterion 3 said "names removed by **the tester**",
  which named a role the candidate may not hold.

**What was deliberately left in QA.** Everything else in that bank is testing as a discipline —
automation suites, defect workflow, CI pipelines, test-case design, selector strategy. A full-stack
engineer meets those as a consumer, not as the person who owns them, and the frontend bank already
gives them `what-to-test-on-a-login-screen` and `the-test-that-broke-for-nothing`.

**A constraint found on the way, which the owner should know about.** `fullstack`'s
`supported_question_types` is `technical, scenario, behavioral` — it does **not** include
`test_design`. So QA's three archetypal "what would you test?" questions (`test-design-signup-form`,
`test-design-otp-screen`, `test-design-money-transfer`) cannot carry this role at all;
`check-bank.mjs` would reject them. If the testing mindset should reach full-stack through those,
it is a one-line content change to `roles.yaml`, not a re-tag.

### The near miss

**`the-field-that-changed-shape`** (technical, `testing-apis`, mid) — an endpoint's `salary` goes
from a number to an object overnight and the Android app shows nothing. On merit it is the strongest
transfer in the QA bank, because "what is the client entitled to assume" is the whole of
`fullstack-boundary`, this role's defining topic. It was left because it is a contract question
rather than a testing-mindset one, which was the brief, and because its answer key leans on contract
checks running in the API's own pipeline — QA craft. If the boundary questions below are slow to
arrive, this is the one to tag in the meantime.

### What this pass did not do

The role still has **no track** (both levels give `track_not_found`) and **no questions of its own**:
`fullstack-boundary` 0 of 5 and `deployment-basics` 0 of 4, the ~8 questions in "Target counts"
above. Those are writing, not tagging, and they are what is left of this role's work.

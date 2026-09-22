# Frontend engineer — question bank blueprint

**Wave 1. Status: blueprint drafted 2026-09-22; the bank is 8 questions and is being extended.**
Derived from `docs/role-catalogue.md` § Frontend Engineer.

## What the role is

Builds what runs in the browser: interfaces, state, and performance on the devices people actually
own. An interview for it is trying to find out whether the candidate can hold the browser in their
head — one thread, an unreliable network, a screen 360 pixels wide — or whether they have only ever
seen a framework. The best signal is a debugging walkthrough: the candidate is given something that
is wrong and has to narrow it down out loud.

This bank is also the standard the other roles are brought up to. It is the only one M2 drafted in
full, and its eight questions are the house style everything else copies.

## Levels

| Level         | Offered                                     | Written in this pass | Notes                                                                                                                                                                                        |
| ------------- | ------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| intern-junior | yes                                         | yes                  | Six of the eight existing questions are offered here.                                                                                                                                        |
| mid           | yes                                         | yes                  | **Frontend has no `mid` track** — a mid candidate gets `track_not_found` today. The questions can be written without it; the track is a separate, larger piece of work (see _Out of scope_). |
| senior        | no — the level exists and no role offers it | no                   | System design and rubric dimensions the junior/mid rubrics do not contain. `levels.yaml` says why.                                                                                           |

## Stack variants

Five, from `roles.yaml`. The default is React + TypeScript, which is what most of this market
advertises.

| Variant                        | Own questions | Why                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-typescript` _(default)_ | 3             | The default, and the two tagged questions we already have. A React candidate should meet more than two variant questions in a bank this size.                                                                                                                                                 |
| `nextjs`                       | 3             | **Both existing tagged questions carry `nextjs` and neither is about Next.js** — they are React questions a Next.js candidate can also answer. At least two must be genuinely about it: rendering on the server vs the client, data fetching, and what the framework does to a page's weight. |
| `vue-nuxt`                     | 2             | Real local use, and today a Vue candidate meets zero variant questions.                                                                                                                                                                                                                       |
| `angular`                      | 2             | Enterprise and banking work here still runs on it. The variant I would cut first if a reviewer says it is rare in practice — flagged rather than assumed.                                                                                                                                     |
| `vanilla-js`                   | 2             | The variant a self-taught candidate most often arrives on, and the one most likely to be under-served by a bank written by someone thinking in React.                                                                                                                                         |

**A rule this bank got wrong and this pass fixes:** `react-state` has **no general question at all**
— both of its questions are React-tagged, so a Vue, Angular or vanilla candidate practises nothing
about where state lives. Component state and data flow is a general topic with framework-specific
questions hanging off it, not a React topic.

## Core topics

The catalogue lists nine core topics. `frontend/track.yaml` disagrees with it: **accessibility and
frontend testing are `core: false` there**, which is what feeds readiness coverage (spec §7).

**Recommendation: make both core** and change the track in the same pass. Accessibility is asked in
real interviews here, it is cheap to test in conversation, and a role page that treats it as
optional teaches the wrong thing. Frontend testing is core for the same reason backend testing is.
If the reviewer disagrees, the change is one boolean each.

| Topic slug                | Core                  | In `topics.yaml` | General today (ij / mid) | Target (ij / mid) |
| ------------------------- | --------------------- | ---------------- | ------------------------ | ----------------- |
| `javascript-fundamentals` | yes                   | yes              | 1 / 1                    | 2 / 2             |
| `react-state`             | yes                   | yes              | **0 / 0**                | 2 / 2             |
| `css-layout`              | yes                   | yes              | 1 / 0                    | 2 / 2             |
| `browser-rendering`       | yes                   | yes              | 1 / 1                    | 2 / 2             |
| `web-networking`          | yes                   | yes              | 1 / 0                    | 2 / 2             |
| `accessibility`           | yes _(track says no)_ | yes              | 0 / 0                    | 2 / 2             |
| `frontend-testing`        | yes _(track says no)_ | yes              | 0 / 0                    | 2 / 2             |
| `debugging`               | yes                   | yes              | **0 / 0**                | 2 / 2             |
| `collaboration`           | yes                   | yes              | 2 / 1                    | 2 / 2             |

`debugging` has no question despite being core and despite being the thing the catalogue calls the
role's best conversational signal. `css-overflow-at-360` and `slow-page-on-3g` are _about_
debugging but hang from `css-layout` and `browser-rendering`, which is correct — the topic needs
questions of its own about method: reading a stack trace, bisecting, reproducing from a vague report.

**New topic rows this bank needs:** none. It needs one **rename**: `react-state` is named "React
state and data flow" and should be "Component state and data flow", with the description following.
The slug stays — slugs are permanent and renaming one creates a second topic.

## What the engine can deliver

`supported_question_types` for frontend is `technical, scenario, behavioral`.

| Round a real frontend interview has | Can we?                                                 | Consequence                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Concepts and trade-offs             | **Yes**                                                 | The bulk of this bank.                                                                                                                          |
| Debugging walkthrough               | **Yes** — and it is the best thing the engine does      | Under-used today; three of the new questions are this shape.                                                                                    |
| Behavioural                         | **Yes**                                                 | Shared rubric.                                                                                                                                  |
| "Build this component"              | **No** — needs a code editor (Monaco + Judge0, P2)      | The role's page must say the bank does not prepare you for a live coding round. Not one question in this bank asks the candidate to write code. |
| Component / UI design discussion    | **Partly** — as conversation, without a drawing surface | Written as `scenario`, about structure and trade-offs, never "sketch the component tree".                                                       |

## Target counts

Nine core topics × two levels × the floor of two = **36 general slots**. Nine are filled by the
existing eight questions (most carry both levels, so one question fills two slots). Filling the
remaining 27 takes **about 16 new general questions**, because a question written for both levels
fills a slot in each and most of them should be.

The stack targets are 12 slots, of which 4 are filled by the two existing React-tagged questions.
That is **about 9 new tagged questions**, fewer than 12 because a React question carries
`react-typescript` and `nextjs` together — and, where a full-stack interview would ask it too,
`react-node`.

```yaml
# targets (read by check-bank.mjs)
role: frontend
levels: [intern-junior, mid]
general_by_topic:
  javascript-fundamentals: { intern-junior: 2, mid: 2 }
  react-state: { intern-junior: 2, mid: 2 }
  css-layout: { intern-junior: 2, mid: 2 }
  browser-rendering: { intern-junior: 2, mid: 2 }
  web-networking: { intern-junior: 2, mid: 2 }
  accessibility: { intern-junior: 2, mid: 2 }
  frontend-testing: { intern-junior: 2, mid: 2 }
  debugging: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  react-typescript: 3
  nextjs: 3
  vue-nuxt: 2
  angular: 2
  vanilla-js: 2
complete: false
```

|          | General | Stack-tagged | Total   | Today |
| -------- | ------- | ------------ | ------- | ----- |
| Frontend | ~20     | ~11          | **~31** | 8     |

About 23 new rubrics: one per new technical and scenario question, none for the behavioural ones,
which share `behavioural-answer-quality`.

## The existing eight

They are not just kept. Two have known weaknesses their own `reviewer_notes` admit, and one has a
defect the checker finds:

- `async-ordering-understanding`, criterion 1, descriptor 4 reads "Correct order, **stated
  confidently**…". That scores delivery, not content — exactly the defect the fairness pass and the
  stress test exist to catch. Fix it in this pass.
- `js-async-ordering` is offered at intern-junior and its own notes doubt that. The stress test
  decides: if the junior sample answers cannot separate, it becomes mid-only.
- `react-state-placement` and `react-unnecessary-effect` are tagged `react-typescript, nextjs,
react-node`. The tags are right; what is missing is their general counterparts (above).
- `stuck-and-asked-for-help` and `pushing-back-on-a-release` (QA) both carry the hierarchy-norms
  worry in their notes. The fairness pass owns that, across both banks at once.

## Out of scope, deliberately

- **Senior.** No role offers the level.
- **A `mid` track.** Frontend has a track at `intern-junior` only, so a mid candidate gets
  `track_not_found` — and so do backend at intern-junior, QA at mid, and full-stack at both. That is
  five of the eight role × level combinations with no learning content, and it is a lessons problem,
  not a question-bank one. Named here so it is a decision. `check-bank.mjs` reports it every run.
- **Coding rounds.** Not one question asks the candidate to write code, because the engine cannot
  take it.
- **Any question tagged for all five variants**, which is a general question with a list attached.

---

## Appendix A — fact-check log

_Filled as the bank is drafted._

| Question | Claim | Checked against | Date | Outcome |
| -------- | ----- | --------------- | ---- | ------- |

## Appendix B — what the critique passes changed

_Filled after the four passes in `.claude/skills/question-bank/references/critique.md`._

| Pass                         | Findings | Applied | To `reviewer_notes` |
| ---------------------------- | -------- | ------- | ------------------- |
| Senior interviewer (Nigeria) |          |         |                     |
| Hiring manager (remote)      |          |         |                     |
| Nervous junior               |          |         |                     |
| Fairness                     |          |         |                     |

## Appendix C — coverage after drafting

_Filled at the end of the role's pass: the bank against this blueprint, and against what a real
junior and mid frontend interview covers here._

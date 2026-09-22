# QA engineer — question bank blueprint

**Wave 1. Status: blueprint drafted 2026-09-22; the bank is 3 questions and is being extended.**
Derived from `docs/role-catalogue.md` § QA Engineer.

## What the role is

Designs the tests, finds what breaks, and says clearly why it matters. The catalogue rates it
**Full** — the best engine fit on the entire list — because a QA interview is largely "here is a
feature, how would you test it?", and that is exactly a conversation with follow-ups. There is no
round we are missing and no tooling we owe it.

That has a consequence worth stating plainly: **for QA, the bank is the whole product.** Every other
role can blame a missing code editor for the gap between our preparation and a real interview. This
one cannot.

## Levels

| Level         | Offered                                     | Written in this pass | Notes                                                                                                                             |
| ------------- | ------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| intern-junior | yes                                         | yes                  | The track is here, and QA is one of the widest entry routes into tech locally — a large part of this audience arrives through it. |
| mid           | yes                                         | yes                  | **No `mid` track**, and only two of the three existing questions reach mid.                                                       |
| senior        | no — the level exists and no role offers it | no                   | `levels.yaml` says why.                                                                                                           |

## Stack variants

Seven, and one of them behaves differently from every other variant in the catalogue.

| Variant                          | Own questions       | Why                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual-exploratory` _(default)_ | **0, deliberately** | It is not a technology, it is the absence of one. Its subject matter — test design, exploratory charters, bug reporting — is what every QA candidate needs, so it belongs in the **general** set. Tagging those questions `manual-exploratory` would hide test design from the automation candidates who most need it. |
| `selenium-java`                  | 2                   | Still the most common automation stack in local enterprise and banking QA.                                                                                                                                                                                                                                             |
| `cypress`                        | 2                   |                                                                                                                                                                                                                                                                                                                        |
| `playwright`                     | 2                   | Overlaps Cypress heavily; a question about waiting, flakiness or selectors is often fairly tagged for both.                                                                                                                                                                                                            |
| `api-testing`                    | 2                   | Postman and RestAssured. Note the slug collides in conversation with the **topic** `testing-apis` — the stack is the tool, the topic is the skill.                                                                                                                                                                     |
| `appium`                         | 1                   | Narrow locally; the variant to check with a reviewer before writing the second.                                                                                                                                                                                                                                        |
| `performance-testing`            | 2                   | k6 and JMeter. Distinct enough from functional testing that its candidates get nothing from the general set.                                                                                                                                                                                                           |

## Core topics

Eight in the catalogue, plus `debugging`, which `qa/track.yaml` already marks core and which is what
`intermittent-failure-triage` is really about.

| Topic slug            | Core | In `topics.yaml` | General today (ij / mid) | Target (ij / mid) |
| --------------------- | ---- | ---------------- | ------------------------ | ----------------- |
| `test-design`         | yes  | yes              | 1 / 0                    | 2 / 2             |
| `risk-based-testing`  | yes  | **new**          | 0 / 0                    | 2 / 2             |
| `defect-reporting`    | yes  | yes              | 1 / 1                    | 2 / 2             |
| `testing-apis`        | yes  | **new**          | 0 / 0                    | 2 / 2             |
| `test-automation`     | yes  | **new**          | 0 / 0                    | 2 / 2             |
| `ci-pipelines`        | yes  | **new**          | 0 / 0                    | 1 / 2             |
| `exploratory-testing` | yes  | **new**          | 0 / 0                    | 2 / 2             |
| `test-data`           | yes  | **new**          | 0 / 0                    | 2 / 2             |
| `debugging`           | yes  | yes              | 0 / 0                    | 2 / 2             |
| `collaboration`       | yes  | yes              | 3 / 2                    | 2 / 2             |

One deviation from the floor: **`ci-pipelines` at intern-junior is one.** A junior tester is fairly
asked what a failing pipeline means and what they do about it; they are not usually the person who
owns it.

`test-data` is worth its two at both levels for a reason specific to us: the honest answer to "where
does your test data come from" is often "a copy of production", which is a privacy incident waiting
to happen and something this product has opinions about (NDPA 2023, CLAUDE.md §5). It is a fair
junior question and a good one.

**New topic rows this bank needs:** `risk-based-testing`, `testing-apis`, `test-automation`,
`ci-pipelines`, `exploratory-testing`, `test-data` — six.

## What the engine can deliver

`supported_question_types` for QA is `test_design, scenario, behavioral, technical` — the only role
with `test_design`, and it is the one that makes QA the best fit on the list.

| Round a real QA interview has                | Can we?                                     | Consequence                                                                                        |
| -------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "Here is a feature — how would you test it?" | **Yes**, and it is the role's central round | The `test_design` type exists for this. It should be the largest share of the bank.                |
| Bug triage and reporting                     | **Yes**                                     |                                                                                                    |
| Exploratory session, talked through          | **Yes**                                     |                                                                                                    |
| Behavioural                                  | **Yes**                                     | Shared rubric.                                                                                     |
| Automation code written live                 | **No** — needs a code editor (P2)           | Automation questions ask about strategy, waiting, selectors and flakiness, never "write the test". |

Nothing else is missing. That is the point of this role.

## Target counts

Thirty-nine general slots, seven filled. About **18 new general questions**, weighted towards
`test_design` and `scenario`, which is what the interview is made of.

Eleven stack slots, all empty: about **9 new tagged questions**, fewer than eleven because a
question about flaky waits is fairly tagged for both Cypress and Playwright.

```yaml
# targets (read by check-bank.mjs)
role: qa
levels: [intern-junior, mid]
general_by_topic:
  test-design: { intern-junior: 2, mid: 2 }
  risk-based-testing: { intern-junior: 2, mid: 2 }
  defect-reporting: { intern-junior: 2, mid: 2 }
  testing-apis: { intern-junior: 2, mid: 2 }
  test-automation: { intern-junior: 2, mid: 2 }
  ci-pipelines: { intern-junior: 1, mid: 2 }
  exploratory-testing: { intern-junior: 2, mid: 2 }
  test-data: { intern-junior: 2, mid: 2 }
  debugging: { intern-junior: 2, mid: 2 }
  collaboration: { intern-junior: 2, mid: 2 }
by_stack:
  selenium-java: 2
  cypress: 2
  playwright: 2
  api-testing: 2
  appium: 1
  performance-testing: 2
complete: false
```

|     | General | Stack-tagged | Total   | Today |
| --- | ------- | ------------ | ------- | ----- |
| QA  | ~21     | ~9           | **~30** | 3     |

About 26 new rubrics. QA is also the role where a **shared rubric across questions** is most
defensible: several `test_design` questions score the same three dimensions (coverage of cases,
reasoning about risk, saying what is out of scope) against different features. Where two questions
genuinely score the same dimensions, they share — and the stress test is run once per rubric, which
is the unit the owner chose.

## The existing three

- `test-design-signup-form` — the age rule gives the rubric an objective anchor, which is why it is
  in the prompt. Its notes ask whether a sign-up form is too easy at this level, and whether the
  phone-number formats are the ones a Nigerian tester would name. Both are reviewer questions.
- `intermittent-failure-triage` — scored with the defect-reporting rubric, which its own notes call
  a stretch, because the answer is as much about investigation as about reporting. With
  `debugging` now a target topic this resolves cleanly: the question stays, and it gets a rubric
  about investigation.
- `pushing-back-on-a-release` — the question the drafter was least sure about, and the fairness
  pass's clearest case: it can reward people who are comfortable being difficult and penalise
  people from workplaces where disagreeing upward is not done. Keep, reword, or cut is the
  reviewer's call; the fairness pass proposes the rewording.

## Out of scope, deliberately

- **Senior**, and a `mid` track.
- **Writing automation code.** Strategy, not syntax.
- **Tagging the general set `manual-exploratory`** (see above). If a reviewer disagrees, that is a
  one-line change and it is worth arguing about.

---

## Appendix A — fact-check log

_Filled as the bank is drafted._

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

_Filled at the end of the role's pass._

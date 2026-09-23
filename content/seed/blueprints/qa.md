# QA engineer — question bank blueprint

**Wave 1. Status: blueprint drafted 2026-09-22; the bank drafted 2026-09-23 — 3 questions to 35.**
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

| Variant                          | Planned             | Drafted | Why                                                                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual-exploratory` _(default)_ | **0, deliberately** | 0       | It is not a technology, it is the absence of one. Its subject matter — test design, exploratory charters, bug reporting — is what every QA candidate needs, so it belongs in the **general** set. Tagging those questions `manual-exploratory` would hide test design from the automation candidates who most need it. |
| `selenium-java`                  | 2                   | 2       | Still the most common automation stack in local enterprise and banking QA.                                                                                                                                                                                                                                             |
| `cypress`                        | 2                   | 3       |                                                                                                                                                                                                                                                                                                                        |
| `playwright`                     | 2                   | 3       | Overlaps Cypress heavily; a question about waiting, flakiness or selectors is often fairly tagged for both.                                                                                                                                                                                                            |
| `api-testing`                    | 2                   | 2       | Postman and RestAssured. Note the slug collides in conversation with the **topic** `testing-apis` — the stack is the tool, the topic is the skill.                                                                                                                                                                     |
| `appium`                         | 1                   | 1       | Narrow locally; the variant to check with a reviewer before writing the second.                                                                                                                                                                                                                                        |
| `performance-testing`            | 2                   | 1       | k6 and JMeter. **One, not two** — `performance-what-to-ask-first` was untagged in this pass, because it names no tool and is pure requirements elicitation, and tagging it hid the most portable question in the bank from everyone else. The shortfall is reported rather than filled.                                |

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

|             | General | Stack-tagged | Own total | Offered to a candidate |
| ----------- | ------- | ------------ | --------- | ---------------------- |
| Planned     | ~21     | ~9           | ~30       | —                      |
| **Drafted** | **25**  | **10**       | **35**    | **45**                 |

The ten extra are the ten role-general questions that live in the frontend and backend banks and
carry `qa` — nine of them did already, and `it-works-for-me` gained the role in this pass, which its
own notes had asked for. Stack tagging means any one candidate is actually offered about **37**.

About 26 new rubrics. QA is also the role where a **shared rubric across questions** is most
defensible: several `test_design` questions score the same three dimensions (coverage of cases,
reasoning about risk, saying what is out of scope) against different features. Where two questions
genuinely score the same dimensions, they share — and the stress test is run once per rubric, which
is the unit the owner chose.

## The existing three, and what happened to them

All three survived, and all three were reworked.

- `test-design-signup-form` — kept at intern-junior. Its prompt gained a third clause because the
  rubric charged 30% for thinking past the happy path and the prompt never asked for it, and
  `test-case-selection` is now weighted **25/30/45** for it alone, with the local phone formats
  written into a descriptor — they were the most locally grounded thing in the bank and were scored
  by nothing.
- `intermittent-failure-triage` — moved from `defect-reporting` to `debugging`, and off
  `defect-report-quality`, which its own notes had called a stretch. It has `failure-investigation`,
  about investigation rather than about how a report is written.
- `pushing-back-on-a-release` — the question the drafter was least sure about, and the fairness
  pass's clearest case. **Reworded** so a disagreement with a senior person is no longer a
  precondition for answering, and **given its own rubric**, `raising-a-quality-concern`, because all
  four critique passes said the generic behavioural one could not score what it asks. The slug still
  says "pushing back"; slugs are permanent.

## Out of scope, deliberately

- **Senior**, and a `mid` track.
- **Writing automation code.** Strategy, not syntax.
- **Tagging the general set `manual-exploratory`** (see above). If a reviewer disagrees, that is a
  one-line change and it is worth arguing about.

---

## Appendix A — fact-check log

Every version-sensitive claim in the bank, checked against the vendor's own current documentation on
**2026-09-23**. All of them are in the stack-tagged set, which is where a bank goes stale: nothing in
the general set names a product, a version, a price or a benchmark, so nothing there can go stale
silently. Each stack question opens its `reviewer_notes` with the marker `**Version-sensitive:
<claim>, checked against <source> on <date>.**`, so `grep -l 'Version-sensitive'
content/seed/*/questions.yaml` finds them across every bank (`SKILL.md`, hard rules).

Versions the docs were on: **Cypress 16.1.0**, **Playwright 1.63.0**, **Selenium 4.49.0**, **REST
Assured 6.0.1**, **Appium 3.7.0**, **Postman v12** (collection format v3).

**Three of the eight claims had moved, and one of the three was a defect in a question.**

| Question                                       | Claim                                                                                                      | Checked against                               | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cypress-fixed-wait` / `playwright-fixed-wait` | Both tools retry an assertion until it passes or a timeout expires, so the fixed wait adds nothing         | docs.cypress.io, playwright.dev               | **Holds, and more strongly than the question claimed.** Cypress calls `cy.wait(Number)` an anti-pattern by name; Playwright marks `waitForTimeout` "discouraged" and "debugging only". And the sharpest form of the point was missing from the key: **three seconds is shorter than either tool's own assertion budget** (Cypress `defaultCommandTimeout` 4000 ms, Playwright `expect` 5000 ms), so the sleep is not merely redundant |
| `cypress-fixed-wait`                           | What replaces a fixed wait                                                                                 | docs.cypress.io                               | **Nuance the rubric would have marked down.** The idiomatic replacement is `cy.intercept` plus `cy.wait('@alias')` — `cy.wait` used correctly rather than abolished. Level 1 read "replaces one guess with another… a retry around the whole test", which a candidate naming the alias route could have been scored onto. Fixed                                                                                                       |
| `selectors-that-break`                         | All three tools offer a way to find an element by accessible role and visible text                         | playwright.dev, docs.cypress.io, selenium.dev | **Moved, and the answer key was wrong for two of the three tagged stacks.** True natively for Playwright only. **Cypress 16 ships no role or label query at all** and its own Best Practices rates a `data-*` attribute "Always" while telling you to avoid elements whose text may change; Selenium has no role locator, only `getAccessibleName()` as a post-location read. The key and the rubric are now tool-conditional         |
| `selenium-stale-element`                       | The exception means the element is no longer attached, and relocating is the remedy                        | selenium.dev                                  | **Holds**, in the docs' own words ("Always relocate the element every time you go to use it"). Two nuances added: the docs give **three** causes, not one, and the locator-storing **wrapper is documented practice**, not the flourish the rubric treated it as. One caution recorded in the question's notes — the docs never say "waiting cannot help" in so many words, so that discriminator is our inference, sound but ours    |
| `cypress-login-in-every-test`                  | Cypress has a first-class, non-experimental way to cache and restore a session between tests               | docs.cypress.io                               | **Holds**, GA since 12.0.0, and the app guide's own heading is "Fully test the login flow — but only once!". Two documented answers to the prompt's "what do you lose" were missing from the key and are now in it: a restored session can be **dead** and needs a cheap check that re-establishes it, and caching **within one spec file only** is the default, so 30 spec files still sign in 30 times                              |
| `playwright-tests-sharing-an-account`          | `workers`, `storageState`, and a per-worker pattern for a shared account                                   | playwright.dev                                | **Holds, and it settles the question's open decision.** The docs' section heading is "Moderate: one account per parallel worker", described as "the **recommended** approach for tests that **modify server-side state**" — which is exactly this scenario. The key no longer hedges between per-worker and per-test, and the mechanism is named (a worker-scoped fixture keyed on the worker index)                                  |
| `api-collection-that-only-works-in-order`      | A value can be captured from one response into the next request, and a collection runs from a command line | learning.postman.com, rest-assured.io         | **Capability holds; the tool moved.** **Newman no longer reads the collection format Postman v12 uses** and its own page directs readers to the Postman CLI (`postman collection run`). Nothing in the question names a tool, so the question is unaffected — the note now says so, and a candidate who answers "newman" is a version behind rather than wrong                                                                        |
| `api-testing-three-environments`               | Environments for a base URL, and a way to hold a secret outside the file                                   | learning.postman.com                          | **Environments hold; the secrets vocabulary moved.** There is no longer a "secret" variable **type** — it is a **secure variable**, and **vault secrets** are now the recommended home for credentials. The docs also frame the hazard as _syncing and team sharing_ rather than as committing to git, which is the framing this question uses                                                                                        |
| `appium-passes-on-the-emulator`                | The same script drives an emulator and a real device                                                       | appium.io                                     | **Holds** — the driver is "tested on emulators and real devices" and the quickstart's only difference is setup. One nuance added, because the prompt asks what changes about _where they run_: **the capabilities differ even though the script does not** (`udid` for a real device, `avd` for an emulator), which is a configuration change rather than a test change                                                               |

Two claims carry the marker and name nothing version-sensitive at all, deliberately:
`load-test-that-proved-nothing` and (before it was untagged) `performance-what-to-ask-first` name no
tool, so they hold for k6 and JMeter alike.

**The eight above are the re-check list.** `tasks/todo.md` carries the open decision on how often
that happens and who does it — the marking makes them findable, which is not the same as checked, and
three of eight had moved after one day.

### And the arithmetic

Checked by working it out rather than by recognising it (`SKILL.md`, "Check the arithmetic, not only
the vendor"). `check-bank.mjs --numbers` printed 383 quantitative claims across the banks. Three
things were wrong in the QA bank and all three were found this way, not by the fact-check:

- `load-test-validity` said the average was taken over "the twenty-something requests in twenty that
  did not fail". 920 of 18,400 is **one in twenty**. Corrected.
- `test-design-money-transfer` gave the limit boundaries as ₦199,999 / ₦200,000 / ₦200,001 — whole
  naira steps on a field that probably accepts kobo, so the stated neighbours are not the neighbours.
  The answer key now asks what the smallest step the field accepts is, which is the better question.
- `the-upload-nobody-tested` described a photographed CV as "several megabytes", which may exceed the
  5 MB limit the question states and so would be _rejected_ — the opposite of the point, which is a
  file that passes every check and is unreadable. Now "the right type, inside the limit".

Verified and correct: 17,480 of 18,400 is exactly 95.0%, leaving 920; 140 sign-ins at six seconds is
14.0 of 22 minutes; rounding down and rounding to nearest agree wherever the fraction is under half a
naira (true for round-half-up, which is the reading a discount implies — recorded because it is an
assumption, and the answer key no longer asks a candidate to derive it aloud).

## Appendix B — what the critique passes changed

Four passes, run separately as parallel subagents, each given the bank and its own brief and nothing
about the other three (`.claude/skills/question-bank/references/critique.md`).

| Pass                         | Raised | Applied as edits | Left in `reviewer_notes` |
| ---------------------------- | ------ | ---------------- | ------------------------ |
| Senior interviewer (Nigeria) | 33     | 24               | 6                        |
| Hiring manager (remote)      | 34     | 26               | 6                        |
| Nervous junior               | 38     | 27               | 8                        |
| Fairness reviewer            | 34     | 28               | 5                        |

**The two best findings were mechanical, and the drafter could have run them at any point.** Both
came from the hiring-manager pass and both were verified in one command before anything was changed:

1. **The weights were a template, not a claim.** 21 of 30 rubrics were exactly 35/35/30 and 8 were
   35/30/35; only one differed. `content/seed/REVIEW.md` tells reviewers that weights "are a claim
   about what matters most", and here they asserted nothing — so in every rubric the criterion
   carrying the judgement that transfers was the 30 by default. The comparison is what makes it
   damning: **frontend has 11 distinct weight patterns across 30 rubrics and backend 12 across 29.**
   All 30 were reweighted on the merits; there are now 13 patterns, including 25/30/45, 45/25/30 and
   30/20/50.
2. **Every one of the 90 level-4 descriptors began "As 3, and …"**, and in six named criteria the
   behaviour actually worth hiring on was in that clause — so a candidate scoring 3 across the bank
   read as competent while missing the thing the criterion exists for. The _shape_ is house style and
   was kept (frontend is 89 of 90 the same way); the **calibration** was the defect. In
   `risk-prioritisation` c1 and c3, `api-test-design` c1, `flaky-suite-response` c3,
   `exploratory-attack-ideas` c3, `oracle-reasoning` c3 and `test-data-isolation` c3 the level-4
   clause moved down to 3 and level 4 became the rarer thing.

**The fairness pass's central finding is the one to carry to every future bank**: `qa/rubrics.yaml`
contained **not one** clause protecting a candidate with no workplace, no access or no colleagues,
while `rubrics.shared.yaml` carries eleven ("a team that treats asking as weakness is a fact about the
workplace, not a fault in the candidate"). The bank's whole fairness promise — that an answer from a
personal project scores the same as one from a job — lived in a **YAML comment at the top of
`questions.yaml` that the evaluator never sees**, and the comment said so itself. Ten criteria that
ask for recall, access or standing now carry the clause in the descriptor, where the model reads it.

**The manner defect returned for the third time in three banks, in a form no lexical check covers.**
Nine level-1 descriptors defined the wrong answer by the _quantity_ of speech — "a detailed plan
that…", "a thorough set of flows", "Names the wrong culprit in detail", "explains in detail", "Prices
it accurately" — so a terse correct answer in a second language matched neither 1 nor 3 and drifted
down, while a long wrong one was at least recognised. All nine rewritten. And the fairness pass found
`defect-report-quality` scoring level 3 on the word **"clear"** — the exact word
`rubrics.shared.yaml`'s header says was removed from that file as a defect, and the one word
`check-bank.mjs` deliberately leaves off its ban list because it does too much ordinary work for a
lexical test. `SKILL.md` says that one "is a defect the fairness critique pass caught by reading, in
context, which is where it has to be caught". It was. The method worked as designed.

**Rubrics that could not score their own questions** — the class of finding this exercise exists for:

- `transactional-test-design` had **no criterion for the money rules**. The ₦200,000 limit, the unit
  the amount is held in, the two transfers each under the limit and together over it, and the PIN
  attempt counter were all in `ideal_points` and scored by nothing, which is the most concrete and
  most learnable part of a good answer. The off-screen verification moved into the criterion about
  interrupted requests, where it belongs, and the third criterion became the rules.
- `test-case-selection` could not be a true claim about both its questions. One pass found its top
  boundary band ("where the rule does not say which side the boundary falls on") **unreachable** on
  the sign-up form, where "18 or over" is exact; another found that everything
  `test-design-otp-screen` is really about — Resend against the counter, two codes in flight, the
  expiry clock — landed in one 30% criterion. The OTP question now has
  `rule-interaction-test-design`, weighted 30/30/40 for exactly that.
- `risk-prioritisation` had the same shape of defect: criterion 1's level 4 was reachable only on
  `where-the-bugs-have-been`, the one of its two questions that hands the candidate any evidence.
- `pushing-back-on-a-release` — **all four passes**, and the drafter's own note. It now has
  `raising-a-quality-concern`; `behavioural-answer-quality` is left with no question in any bank.
- `severity-judgement` criterion 1's level 4 was reachable only by reaching the drafter's own verdict,
  contradicting the question's own claim that either ranking is credited with a reason.
- `test-pipeline-design` criterion 1 penalised "more parallel workers" while the same question's
  answer key recommended parallelising.
- `assertion-strength` criterion 3 bundled three unrelated observations into one criterion whose
  level 3 needed two of three, so the same number meant different things — which matters because M4's
  feedback is built on the evidence quote for that number.

**Two questions were rewritten because they were too easy to be worth the slot**, both flagged by the
drafter and confirmed by two passes each. `the-report-that-came-back` was conspicuously bad — no
steps, no build, "please fix urgently" — so it tested whether a candidate can recite the fields of a
bug-report template. It is now complete by template and still unactionable: the steps cannot be
repeated because there is no account and no job, the expectation is "it should work", and the fact
that decides the whole thing is buried in the last clause. And `two-bugs-one-slot` said the total
_shown_ was ₦50 lower, which reads as display rounding — the exact objection that undercuts the
intended answer. The amount charged is now wrong and the receipt agrees with it.

**Volume and arithmetic done aloud.** Three passes independently objected that
`load-test-that-proved-nothing` turned 40% of its score on dividing 17,480 by 18,400 while speaking.
The success rate is now stated in the table and the insight left is the one people actually miss — the
average was taken over the survivors. The same fix was applied to `ui-login-setup-reasoning`, whose
top band required multiplying by a six-second figure the drafter had never stated.

**What was not applied, and why.** The first finding of both the senior and the junior pass was that
every prompt is triple-barrelled, and the senior pass added the argument that matters: it pre-empts
the engine, whose job is to generate follow-ups that probe missing rubric points (CLAUDE.md §5). That
is a real conflict with the prompt-clause rule, which exists because the frontend pass found nine
criteria charging for something never asked and the backend pass eighteen — and which
`check-bank.mjs` enforces. **It is not the QA bank's decision to make**: it changes every bank and the
skill. It is the first item in this pass's decision list. What _was_ done is the cheaper half — the
riddle clauses became plain questions, and ten prompts that opened on a demonstrative with no
antecedent ("This is all you have", "You sent this and got that back") now name what is on screen,
because the engine speaks the prompt and nothing told the candidate to look.

## Appendix B3 — the planned-follow-up pilot (2026-09-23)

The owner's decision of 2026-09-23 (`docs/progress/2026-09-23-planned-follow-ups.md`) was piloted on
this bank: **every prompt now asks one thing, and the other criteria each carry a probe** in
`planned_follow_ups`. 35 prompts rewritten, **74 probes** written — two per question, except the
three the owner fixed in review (below), which carry three, three and four. Four fresh critique passes were
run on the reshape alone, one per subagent, each given the before/after and its own brief.

| Pass                         | Raised | Applied as edits | Left in `reviewer_notes` |
| ---------------------------- | ------ | ---------------- | ------------------------ |
| Senior interviewer (Nigeria) | 23     | 18               | 3                        |
| Hiring manager (remote)      | 22     | 16               | 4                        |
| Nervous junior               | 26     | 21               | 3                        |
| Fairness reviewer            | 22     | 18               | 3                        |

**All four passes independently found the same structural defect**, which is now a rule in
`SKILL.md`:

> A criterion may be left without a probe only when the opening question asks for **that criterion
> and nothing else.**

One criterion goes un-probed because the prompt asks for it. But where the prompt was open — "What
would you do?", "What do you tell them?", "What would you do before agreeing to that?" — two criteria
competed to be the answer, and a candidate who led with a **probed** one forfeited the un-probed one
with no second chance, because the engine can only probe what has a probe. Six questions had that
shape and three of them on a criterion worth 40% or more: `where-your-test-data-comes-from` (30%),
`the-report-that-came-back` (40%), `intermittent-failure-triage` (35%), `the-suite-nobody-trusts`,
`where-the-tests-run` and `an-hour-with-a-new-feature`. All six openings were narrowed.

The three other findings that became rules:

- **Ask the criteria in the order the work happens.** `an-hour-with-a-new-feature` asked how the hour
  would be spent and then probed what the candidate would decide _before touching anything_; three
  passes called it incoherent. The opening and the first probe were swapped in that question and in
  `the-suite-nobody-trusts`.
- **A probe must not name what its criterion scores them for noticing** — with more force than a
  prompt, because a probe arrives after they have failed to say it. `test-design-otp-screen`'s probe
  said the rules "brush against each other", which is the whole of a 40% criterion; it now walks the
  candidate into one collision and lets them find it.
- **Never read a scoring constraint out loud.** `where-your-test-data-comes-from` probed "explained
  without quoting a regulation at them" — an instruction meant for the evaluator, which told the one
  candidate whose data-protection training is their strongest asset not to use it. **Three of the
  four passes caught that single clause.**

### The two questions the pilot could not fix — and the rule that changed for them

One probe per criterion was a rule of the decision, not of the contract, and two criteria in this
bank score two separable things each:

- `test-design-signup-form` criterion 3 (45%): thinking past the happy path **and** saying where the
  list stops.
- `api-collection-that-only-works-in-order` criterion 3 (25%): what stays manual **and** what a
  failure has to say.

Either the criterion splits — a rubric change, which would invalidate its stress answers — or that
criterion gets two probes. A third case was `pushing-back-on-a-release`, where the senior pass said
two probes is too few for any behavioural answer whatever the criteria say.

**The owner decided on 2026-09-23: a criterion may carry two probes, three is refused, and those
three questions were fixed.** The first probe listed for a criterion is its primary one — the engine
prefers a criterion nothing has probed yet and reaches a second on the same criterion only when no
other criterion is uncovered. `pushing-back-on-a-release` now carries four: one on the criterion the
opening asks, because a candidate can tell the whole story and never say how they knew it was
serious, and two on "how it ended, **and** what is different now". Both of the other two keep the
split-the-criterion alternative in their `reviewer_notes` for the expert.

### What was reported rather than changed

- **Five openings ask a criterion lighter than one of the probes** (`where-the-bugs-have-been` 25%,
  `what-to-automate-first` 35%, and three others). The engine can still probe those criteria, so
  nothing is unreachable; the exposure is to the engine wrongly judging a criterion "covered", which
  is what `session_turns.criteria_covered` exists to make auditable (M3).
- **Strong candidates now talk least**, because pre-empting both probes ends a question in one turn.
  The hiring-manager pass wants "needed no prompting" recorded as a signal. That is an M4 report
  question, not a content one, and it is in the handover.
- **`the-pipeline-has-been-red` and `the-suite-nobody-trusts` now have near-identical probes** about
  what a broken signal costs a team, and both are offered at both levels. Question selection should
  probably not draw both in one session.

## Appendix B2 — what the rubric stress test changed

**33 rubrics × 5 answers = 165 answers**, written from the prompts alone by seven subagents that never
opened a rubric file, then scored by seven more against the criteria.
`check-stress.mjs` enforces the two separations mechanically. **Every rubric passes**:
`fluent-but-wrong` falls between 1.40 and 3.35 points below `strong`, `correct-poorly-explained` sits
0.95 to 3.40 above `weak`, and **`nigerian-english` scored identically to `strong` on every criterion
of every rubric — zero drift anywhere in 99 criteria.** Nothing in this bank rewards a particular
English, which is the one result worth having from the fifth answer.

The exercise changed **31 descriptors, one question's context, one question's answer key, and one of
the drafter's own claims.** It also found a latent crash in the checker: `check-stress.mjs` built its
failure messages with a `const fmt` declared _after_ the loop that used them, so the first separation
ever to fail crashed the script instead of reporting. Nothing had failed before, so nobody had hit it.

### The one hard failure, and what it measured

**`assertion-strength` failed the second separation at +0.60.** The cause is exact and the drafter's
own `reviewer_notes` had already predicted it: the question's context says "`#app-header` is the bar
across the top of every page, including the login page", which hands over criterion 1 — 40% of the
score. The `weak` answer guesses the wait, withdraws it, reads that line back, and lands on level 3
word for word, so an otherwise clueless answer floored at 2.40 while `correct-poorly-explained`
topped out at 3.00. The note said "it now gives the first criterion away, which I do not like but
prefer to an unfair question". **This is the measurement of what that costs.** Criterion 1 now puts
the premise-read-back at level 2 and reserves level 3 for saying what the assertion is actually true
of — that a page opened at all — which separates "something is wrong" from "here is what this test
measures". It passes at +1.00, and the underlying tension is still the reviewer's to settle.

### Wrong beliefs with nowhere to land — 24 of them

The blind writing is what produces these: a writer who cannot see the rubric commits to a wrong
belief the drafter did not anticipate, and the scorer then has to land on a descriptor that is
_literally_ satisfied while the answer's actual error goes unnamed. That is precisely the case where
M4's evidence quote will contradict the descriptor it was scored against. Two scorers named the same
shape independently: **"the level-1 descriptor was written for _a_ wrong answer, not for _this_ wrong
answer."** That is a refinement of the house rule, not a restatement of it — one wrong-belief
descriptor per criterion is not enough when the blind answer reaches for a different wrong belief of
equal plausibility.

The three worst, because in each the wrong belief scored as competence on the heaviest criterion:

- **`exploratory-attack-ideas`** — the answer's rule is "a defect is a deviation from a documented
  requirement", so everything outside "PDF or Word, up to 5 MB" becomes an enhancement request. It
  _does_ name the stated limit before calling something a defect and it _does_ separate defects from
  non-defects, so **by the letter of level 3 it scored 3** while its rule discards every finding the
  exploration produced.
- **`automation-selection`** — a defect-based measure, specific and articulate, and wrong for a
  regression suite: "how many new defects did the automation find", with "a suite that's always green
  is a suite that isn't working". Level 1 covered only output metrics, so it scored 3 on a 40%
  criterion.
- **`rule-interaction-test-design`** — asserts what the rule interactions are instead of asking, and
  argues for the one that makes the lockout unenforceable ("the count starts fresh against the new
  code"). Nothing below level 3 fitted.

Two were **structural mistakes of the drafter's own**: `test-data-isolation` and `repeatable-test-data`
both had levels 1 and 2 that were not ordered on one axis — level 1 was "recommends the shortcut as
having fixed it", level 2 was "mentions a shortcut without saying what it costs", and an answer that
did _both_ fitted neither, so two readers would split. And `api-collection-repeatability`'s level 3
required the candidate to say "the token expires" when **the question's context never said the token
had a lifetime**; the only answer that mentioned it _invented_ it. The context now states it.

One was a **false claim in the drafter's note**, which is the finding worth carrying furthest. Of
`testing-without-a-spec`'s date example I had written that `03/11/2026` and `11 March 2026` "cannot
both be right". They can — they are the same date if the list puts the month first — and a blind
writer took exactly that wrong turn in the other direction, calling them four months apart and filing
a backend defect. The data does not settle that question; the _convention_ does, which is a better
question for this audience, and both the note and one answer-key point described a question that had
not been written. `SKILL.md`'s "a claim you recognised is not a claim you checked" applied to the
drafter's own prose.

### The systemic calibration finding

`references/stress-test.md` says the `weak` answer "should not score above 1 on the content criteria".
**In this bank it reaches 2.00 in seven rubrics** — `test-case-selection`, `assertion-strength`,
`api-test-design`, `test-pipeline-design`, `failure-investigation`, `api-environment-config` and
`parallel-test-isolation` — and three scorers said why, independently: the **level-2 descriptors are
reachable by naming the right topic with no content behind it.** "Right number, wrong number, right
password, wrong password" satisfies "valid and invalid cases without a stated reason"; a single
empty-field check satisfies "some boundaries"; "a base URL variable" and "run it again a few times"
each satisfy their level 2. The bottom of those scales is not anchored, and it is why the narrowest
separations in the bank are narrow. One was fixed here (`test-case-selection`'s "some boundaries" now
says a single empty-field check is level 1); **the rest is a worklist, not a defect the separations
caught**, because a floating `weak` still sits well below `correct-poorly-explained`.

### The three narrowest, to watch when the bank next changes

`rule-interaction-test-design` (+1.40 / +1.20), `oracle-reasoning` (+1.60 / +1.25) and
`assertion-strength` (+1.60 / +1.00). All three are narrow for the same reason — their heaviest
criterion is answerable from something the question hands over, or was until this pass.

And one result worth stating plainly: **`raising-a-quality-concern` passed decisively, 0.40 against
2.75.** Criterion 1's level 1 had been written from the blind writer's own report — "a well-told
account in which the case was somebody else's to make and the candidate's own part is that they
admired it" — and the answer landed on it word for word. The defect this same exercise found in the
backend bank's behavioural rubric did not reproduce, because the lesson from it was applied before the
test rather than after.

## Appendix C — coverage after drafting

**35 own questions — 25 general and 10 stack-tagged — against a blueprint that asked for about 30.**
A QA candidate is offered **45**, because ten role-general questions live in the frontend and backend
banks and carry this role; stack tagging means any one candidate sees about **37**. 33 rubrics for 35
questions, because `test-case-selection` and `risk-prioritisation` each serve two questions that
genuinely score the same dimensions.

By type: **7 `test_design`, 18 `scenario`, 9 `technical`, 1 `behavioral`.** Twenty-five of the
thirty-five are the two types a QA interview is actually made of, which is what the blueprint asked
for. Nothing in the bank asks a candidate to write code.

Six new topic rows, as planned: `risk-based-testing`, `testing-apis`, `test-automation`,
`ci-pipelines`, `exploratory-testing`, `test-data`.

### The two shortfalls, reported rather than filled

Both are the owner's decision-1 doctrine from the backend bank applied here: decide the level per
question, and let the floor report a gap rather than meeting it with a mid question wearing a junior
label. `check-bank.mjs` prints both every run.

- **`test-automation` at intern-junior: 1 of 2.** `what-to-automate-first` moved to mid only, because
  its third criterion carries 40% for how you would know in three months whether it paid off, and that
  needs a suite somebody has lived with. One pass proposed the cheaper junior version — "here are five
  manual cases, which would you automate first and why" — and it is not written.
- **`performance-testing`: 1 of 2.** `performance-what-to-ask-first` was untagged, so the variant has
  only `load-test-that-proved-nothing`. Two passes and the drafter's own note agreed the untagging is
  right; the second tagged question is not written.

Everything else meets its floor at both levels, including `test-data` at intern-junior, which was a
shortfall until `the-test-that-cannot-run-twice` was split out of `the-test-that-only-passes-once` —
a split two passes reached independently, and one the drafter's note had warned would _conveniently_
close a shortfall. Both facts are on the record so a reviewer can disagree knowingly.

### The judgement share

**10 of the 45 questions a QA candidate is offered** are about collaboration, written communication or
their own work — the one-in-four ratio the owner set on the backend bank, counted by topic rather than
by `type`. Nine of the ten are borrowed; the bank writes exactly one behavioural question of its own.
That is deliberate and worth a reviewer's attention: before this pass, nine of the twelve questions a
QA candidate saw were judgement questions from other banks, and the bank's job was the QA craft.

### What this bank still does not prepare a candidate for

The engine owes QA nothing — that is the point of the role — so everything here is content that is
not written rather than tooling that does not exist. The senior interviewer's and hiring manager's
gap lists converged on these, and none is a defect in what was drafted:

- **Testing an Android app on a real phone, as general content.** Almost everything shipped here is an
  Android app on a mid-range phone, and the only question about devices, network conditions,
  permissions, storage or an app upgrade is `appium-passes-on-the-emulator` — tagged, mid, and about a
  tool. Install and upgrade paths, an old app version against a new API, offline and reconnect belong
  in the general set at both levels. **This is the largest gap in the bank.**
- **`manual-exploratory` is the default variant and has zero tagged questions.** The blueprint argues
  that its subject matter belongs in the general set and that tagging it would hide test design from
  automation candidates — and that argument still holds. But the consequence, which the blueprint did
  not state, is that **the most common candidate in this market practises nothing about their own
  working week**: keeping four hundred manual cases useful, what gets deleted, how a cycle is planned
  and reported, what goes in a summary a non-technical stakeholder reads.
- **Reading a requirement before the code exists.** "Here is a user story and its acceptance criteria
  — what questions do you have, and what would you refuse to sign off?" `testing-without-a-spec` is
  about deciding after the fact. One pass called this the cheapest and most predictive QA question it
  asks.
- **Verifying a fix and closing a defect.** The bank reports defects and never follows one to the end
  — retest scope, whether the fix broke something beside it, when a bug gets reopened.
- **Learning an unfamiliar product with nobody to ask.** Every test-design question hands the
  candidate the rules. A QA hire's first month is working out what the product is supposed to do.
- **Testing against a third party you do not control** — a payment provider's sandbox, a bank test
  environment that is down half the week, callbacks that arrive late or twice. Every QA job here has
  this and nothing in the bank asks it.
- **Authorisation** — "can user A see or change user B's data" is the defect local products ship most
  often, and it exists only as one bullet inside `api-test-design`.
- **Local data as an input class** — names with apostrophes and hyphens, long Yoruba and Igbo names,
  dd/mm dates, kobo, two-SIM users. One general question here would teach more than three on
  partitioning.
- **Somebody else's definition of done**, **estimation**, and **the first week with no documentation**.
- **A `mid` track.** QA offers `mid` and has no track, so a mid candidate gets `track_not_found`.
  Lessons work, not question-bank work, and `check-bank.mjs` reports it every run.

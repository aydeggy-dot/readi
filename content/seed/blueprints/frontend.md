# Frontend engineer — question bank blueprint

**Wave 1. Status: drafted, critiqued, stress-tested and revised to the owner's decisions,
2026-09-22. The bank is 35 questions — 24 general and 11 stack-tagged — and goes next to a human
expert.**
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
  written-communication: { intern-junior: 2, mid: 2 }
  own-work: { intern-junior: 2, mid: 2 }
by_stack:
  react-typescript: 3
  nextjs: 3
  vue-nuxt: 2
  angular: 2
  vanilla-js: 2
complete: false
```

|          | General | Stack-tagged | Total  | Was |
| -------- | ------- | ------------ | ------ | --- |
| Frontend | 24      | 11           | **35** | 8   |

Twenty-nine new rubrics: one per new technical and scenario question, plus four in
`rubrics.shared.yaml` — two that replaced the shared behavioural rubric on the questions it could
not score, and two for the questions the critique passes added.

**Two topics were added after the critique passes** and are deliberately below the floor here:
`written-communication` and `own-work` have one question each rather than two. Both questions carry
all four wave-1 roles, so the second of each belongs in the backend pass rather than in a second
frontend question that would ask the same thing about a browser. `check-bank.mjs` reports the
shortfall every run, which is the point.

## The existing eight

They are not just kept. Two have known weaknesses their own `reviewer_notes` admit, and one has a
defect the checker finds:

- `async-ordering-understanding`, criterion 1, descriptor 4 read "Correct order, **stated
  confidently**…". That scores delivery, not content — exactly the defect the fairness pass and the
  stress test exist to catch. Fixed, and then the whole rubric was replaced (below).
- `js-async-ordering` was offered at intern-junior and its own notes doubted that. **The owner's
  decision: keep the mechanism, change the snippet, and make it mid only.** The four `console.log`s
  and the zero-delay `setTimeout` were the snippet in every "top ten JavaScript interview questions"
  video, so the question sorted candidates by how much interview prep they had watched. It is now a
  click handler that sets "Saving…" and blocks the main thread for two seconds, so the message never
  paints — the same single thread, from a symptom nobody can have memorised, and a real follow-up
  ("so where does the work go?"). The rubric became `Understanding what the main thread is doing`.
  Moving it off intern-junior left `javascript-fundamentals` with one general question there instead
  of two, so **`js-loop-that-returns-nothing` was written to fill the slot** — a `return` inside a
  `forEach` callback, which is where a self-taught junior actually meets this rather than in a
  video. That is the 35th question.
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

Every version-sensitive claim in the bank, checked against the vendor's own current documentation
on **2026-09-22**. Three of the four things checked had moved since the drafter's knowledge of them.

| Question                      | Claim                                                                      | Checked against                                         | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `angular-view-did-not-update` | Change detection runs when the zone tells Angular something happened       | angular.dev/guide/zoneless, angular.dev/roadmap         | **Moved.** Zoneless is the default from **v21**, and Angular's notifications are a short explicit list — a signal read in a template, `markForCheck` (which `AsyncPipe` calls), `ComponentRef.setInput`, template listeners. The question was rewritten around a mutated array, which behaves the same in zone-based, `OnPush` and signal applications                                                                 |
| `angular-view-did-not-update` | `OnPush` is an opt-in strategy                                             | angular.dev/guide/zoneless vs angular.dev/roadmap       | **Unresolved, and the docs disagree with themselves.** The roadmap lists "we set the default change detection strategy to `OnPush`… renamed `ChangeDetectionStrategy.Default` to `Eager`" as done; the zoneless guide still says `OnPush` is "not required, but recommended". The snippet sets it explicitly so the question does not depend on which is true. **Flagged in `reviewer_notes` for an Angular reviewer** |
| `angular-subscription-leak`   | A subscription that outlives its component leaks                           | angular.dev                                             | Holds, and the idiomatic fix has moved several times (`takeUntil`, the async pipe, `takeUntilDestroyed`, signals). The rubric scores tying the subscription to the component's lifetime **by any mechanism**, deliberately. Added an ideal point: on a zoneless Angular the same snippet also fails to render, which a current candidate may well notice                                                               |
| `vue-reactivity-lost`         | Destructuring a `reactive()` object breaks the connection                  | vuejs.org/guide/essentials/reactivity-fundamentals      | Holds. **But Vue 3.5 stabilised reactive props destructure**, so destructuring `defineProps` _is_ reactive — the compiler rewrites it. Added to the answer key, because a candidate who learned on 3.5 may reasonably expect the `reactive()` case to work too, and knowing why props are the exception is the best answer available                                                                                   |
| `nextjs-server-or-client`     | `"use client"` applies to everything imported below it                     | nextjs.org/docs/app/api-reference/directives/use-client | Holds. Added the nuance the docs make explicit: a server component passed as a **child or a prop** is not in the client module graph — it is rendered output. That is now the level-4 answer                                                                                                                                                                                                                           |
| `nextjs-key-in-the-browser`   | `NEXT_PUBLIC_` values are inlined into the browser bundle                  | nextjs.org                                              | Holds, and the docs add that a variable _without_ the prefix is replaced with an empty string in client code — which is why "just remove the prefix" is level 1 in the rubric rather than a fix                                                                                                                                                                                                                        |
| `react-list-key-mixup`        | An index key leaves component state against the wrong item after a removal | react.dev/learn/preserving-and-resetting-state          | Holds — this is the docs' own "fix misplaced state in the list" example. State is kept against the **position**, which is precisely why it ends up beside different data                                                                                                                                                                                                                                               |

Nothing in the bank names a model, a price, a benchmark or a version number, so nothing else in it
can go stale silently. The four stack-tagged families are where to look first next time.

**Since 2026-09-22 the set is findable rather than remembered.** Each of the six questions above
opens its `reviewer_notes` with

```
**Version-sensitive: <the claim>, checked against <source> on <date>.**
```

so `grep -l 'Version-sensitive' content/seed/*/questions.yaml` names every such question in every
bank and `grep -o '\*\*Version-sensitive:[^*]*'` prints the claims with their dates. The rule is in
`SKILL.md`, so later banks are written that way from the start. `angular-view-did-not-update` and
`vue-reactivity-lost` additionally say that a generalist reviewer cannot settle them.

**What does not exist yet is the cycle.** Three of the four claims checked on 2026-09-22 had moved
since the drafter learned them, in a bank three months old — so the marking is worth nothing without
a date by which it is re-read. `tasks/todo.md` carries the open decision: cadence, who does it, and
whether `check-bank.mjs` should warn on a mark older than one cycle.

## Appendix B — what the critique passes changed

Four passes, run separately, each given the bank and its own brief and nothing about the others
(`.claude/skills/question-bank/references/critique.md`). Counts are of distinct findings.

| Pass                        | Raised | Applied as edits | Left in `reviewer_notes` |
| --------------------------- | ------ | ---------------- | ------------------------ |
| Senior interviewer, Nigeria | ~21    | 11               | 6                        |
| Hiring manager, remote      | ~34    | 9                | 7                        |
| Nervous junior candidate    | ~26    | 18               | 3                        |
| Fairness reviewer           | ~28    | 16               | 9                        |

**Three passes independently named the same worst problem**, from three directions: the shared
behavioural rubric. It could not score what its two questions asked — `stuck-and-asked-for-help` is
about judgement on when to ask, `feedback-on-your-code` about handling a comment you did not agree
with, and the rubric scored situation, actions and outcome — so both questions rewarded storytelling
form, which is coachable in an afternoon. And its wording scored delivery: "clear" gated the top of
all three criteria, one asked for an account "in their own words", one wanted detail enough "to be
believable", and level 0 of the heaviest criterion was awarded for saying "we" — the polite register
in much of this audience's working culture. Those two questions now have their own rubrics, and
`behavioural-answer-quality` was rewritten and kept for the backend and QA behaviourals.

The other findings worth recording:

- **A systemic defect the junior pass found and named as a rule: every criterion must have a clause
  in the spoken prompt that asks for it.** Nine questions charged 25–35% for something the prompt
  never requested — `stale-after-saving` and `css-overflow-at-360` asked for a diagnosis and scored
  a fix; `js-copy-or-reference` put 20% on `const`, a word the prompt never said; `js-async-ordering`
  scored "connects it to the user" without asking. All nine prompts gained the missing clause, and
  the rule is now in `SKILL.md`.
- **Two questions were unanswerable without an employer.** `feedback-on-your-code` required someone
  who had had their code reviewed — the only hard experience prerequisite in the bank — and now names
  a mentor, a maintainer or a tutor as well. `error-only-in-production` put 45% on reading an
  error-reporting dashboard, and now lists the fields on screen so the candidate reasons about data
  rather than recalls a product they have never had.
- **Four questions were rewritten rather than cut.** `layout-tools-for-a-screen` ("flex for the row,
  grid for the cards" — the sentence in every tutorial) became the inverse: here is the
  breakpoint-per-size version, what does it cost. `it-works-for-me` gained a real bug report, so the
  answer must contain a hypothesis and not a recitable list of questions. `vue-computed-or-watch`
  became `vue-list-drifts-from-its-source`, a bug rather than a definition. `angular-view-did-not-update`
  gained a snippet, which also fixed the fact-check problem above.
- **Two questions were added, both role-general.** `the-overnight-blocker` — nothing in the bank was
  answered in writing to someone who is not there, which is the condition remote work creates and
  half of what this product is for. `something-you-built` — every other question hands the candidate
  a supplied scenario, so all 31 could be prepared for without ever describing their own code, and
  an interviewer here called that the highest-yield fifteen minutes they have.
- **Four level-4 descriptors rewarded a claimed habit** ("would keep a sample of awkward content
  around", "checks the error rate afterwards") that costs nothing to say. Each now requires a
  distinction or a trade-off that cannot be bluffed.
- **`retry-and-the-double-charge` capped a correct junior answer at level 2**, because level 3 asked
  for an idempotency key — a backend-shaped answer. Confirming state with the server is now level 3;
  the key is level 4.
- **`css-overflow-at-360` rewarded a cause that cannot be true**: `100vw` beside a scrollbar, on a
  phone, where scrollbars are overlaid. Removed from the answer key.

## Appendix B2 — what the rubric stress test changed

Five answers per rubric — **35 rubrics, 175 answers** — written from the prompts alone by subagents
that never saw a rubric, then scored against the criteria. `check-stress.mjs` enforces the two
separations mechanically. **Every rubric passes**: `fluent-but-wrong` falls between 1.50 and 3.65
points below `strong`, `correct-poorly-explained` sits 1.50 to 3.40 above `weak`, and
`nigerian-english` is within one point of `strong` on every criterion of every rubric.

Three rubrics changed because the exercise broke them, and two more were written after it —
`async-ordering-understanding` was replaced wholesale when its question changed, and
`array-return-diagnosis` is new; both were stress-tested the same way, blind:

| Rubric                         | What the answers exposed                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `help-seeking-judgement`       | Criterion 3 (40%) asked whether asking was easy or hard on the candidate's team — which the prompt no longer requests, since "how long did you spend" was removed from it. The `strong` answer scored 2 for answering the question as asked. It now scores the judgement visible in the story, and keeps the workplace-norm point at level 4. |
| `cache-invalidation-diagnosis` | Criterion 3 had no descriptor for saying nothing. `correct-poorly-explained` diagnoses better than `strong` and never proposes a change, and the only level that fitted was "would disable caching everywhere", which is a different failure. Level 0 is now "not addressed — the answer stops at the diagnosis".                             |
| `change-detection-diagnosis`   | Criterion 2 (45%) required **both** ways a change goes unnoticed, but the snippet only exhibits one — so a precise answer was capped below a vague one that listed both. Level 3 now asks for the shape that applies, level 4 for the separation.                                                                                             |

One finding was worth more than any of the three, and the owner's decision was to apply it here
rather than carry it forward:

- **No rubric had a descriptor that fitted a confident, specific, wrong answer.** The scores came
  out right — `fluent-but-wrong` lands on level 1 or 2 everywhere — but the descriptors it landed on
  were written for vagueness ("a rule with no mechanism", "with nothing behind it"), and a fluent
  wrong answer is the opposite of vague. The number would have been right and **the evidence the
  evaluator quotes would have contradicted the descriptor it was scored against** — telling a
  candidate they were vague about something they were specific and wrong about. M4's feedback is
  built on those evidence quotes, so it is the difference between feedback that is trusted and
  feedback that shows we were not listening.

  **Applied on 2026-09-22 across all 34 rubrics: 82 descriptors rewritten**, 73 in
  `frontend/rubrics.yaml` and 9 in `rubrics.shared.yaml`. The wording came from the stress test
  itself — each rubric's `fluent-but-wrong` answer names the wrong belief that question actually
  attracts, so the descriptor could name it too:

  > `"1": Relies on the request rejecting — a `try`/`catch`only, or a confident claim that`fetch`
throws on a 404 or a 500.`

  No score moved: the exercise was to give the same number somewhere honest to land. The rule is in
  `SKILL.md`'s house style and in `references/stress-test.md`, so every bank after this one is
  written that way from the start. `backend/rubrics.yaml` and `qa/rubrics.yaml` are **not** done —
  they are two-rubric M2 stubs their own waves will rewrite, and inventing wrong beliefs for them
  without a stress test behind it is the padding this method exists to prevent.

- **The three narrowest separations are the three to watch**: `network-failure-handling` (+1.50),
  `change-detection-diagnosis` (+1.60) and `semantic-html-diagnosis` (+1.90). In each, a fluent
  wrong answer reaches level 2 on a criterion because it genuinely does part of what is asked.
  `async-ordering-understanding` was the narrowest in the bank at +1.30 and is no longer on the
  list: the rewritten question separates at +2.45, which is some evidence the owner's call on it was
  the right one. The ranking is the checker's output, sorted narrowest first.

Two rubrics were reached by `correct-poorly-explained` scoring **above** `strong` —
`reference-semantics-understanding` (3.80 against 3.00) and `event-binding-diagnosis` (3.75 against
3.35). That is the rubrics working: both rambling answers contain more than the fluent ones do (the
shallow-copy trap; the generalisation about attaching listeners). A rubric with delivery in its
descriptors would have reversed them.

## Appendix C — coverage after drafting

**34 questions, 23 general and 11 stack-tagged**, against a blueprint that asked for about 31. A
frontend candidate is offered 35, because the backend bank's `incident-you-contributed-to` carries
this role as well. Every
core topic meets its floor at both levels, and two deliberately do not:

- `written-communication` and `own-work` have **one question each rather than two**. Both carry all
  four wave-1 roles, so the second of each belongs in the backend pass rather than in a second
  frontend question asking the same thing about a browser. The checker reports it every run.

What this bank still does not prepare a candidate for, in order of how much it matters:

1. **A live coding round.** Out of scope by the engine, stated on the role's page, and the single
   largest gap between this and a real interview here.
2. **Entering an unfamiliar codebase.** Every snippet is complete and small; every scenario is a
   screen the candidate owns. A remote reviewer called this the thing that actually predicts month
   six, and the bank measures knowledge in hand instead. It needs a question shaped like "you join a
   team and pick up a bug in a repo you have never seen" — role-general, and best written in the
   backend pass alongside the second `written-communication` question.
3. **A slipping estimate.** "You said Friday, it is Wednesday and it will not be Friday" — escalating
   before the deadline rather than at it. Also role-general, also for the backend pass.
4. **A `mid` track.** Questions without lessons; named in _Out of scope_ above.

The behavioural share is **4 of 34**, up from 2 of 8. A remote reviewer argued for closer to 40% of
the bank; an interviewer here put the ratio at about one behavioural question in four of an hour.
Four in thirty-five is below both, and the two additions above would take it to six. Worth your view
before the backend pass writes them.

## Appendix B3 — the planned-follow-up retrofit (2026-09-24)

The shape the QA bank piloted (`docs/progress/2026-09-23-planned-follow-ups-pilot.md`), applied here:
**every prompt asks one thing, and the criteria it no longer asks each carry a probe** in
`planned_follow_ups`. 13 prompts rewritten, **81 probes** — two per question, except ten criteria
that score two separable things and carry two, listed below. Four fresh critique passes were run on
the reshape alone, one per subagent, each given the before/after and its own brief and nothing about
the other three: **51 findings, 40 applied, 11 recorded rather than applied** — every one of those
eleven a change to a rubric descriptor rather than to a question.

### The defect all four passes found, from different directions

**A prompt cut to its first clause is not the same as a prompt cut to its first criterion.** The
first pass through this bank narrowed every opening by deleting the trailing clauses, which is
correct in 22 questions and wrong in six: the criterion left without a probe was then not the one the
opening asked, and because it has no probe there is no recovery by construction. It is the same
silent forfeit the field exists to remove, arriving from the other side.

- `fetch-failure-states` — "everything that screen has to handle" is answered by any of the three
  criteria; the 35% enumeration could be forfeited by a candidate who answered well.
- `retry-and-the-double-charge` — "What went wrong?" had two probed criteria as equally good answers.
- `what-to-test-on-a-login-screen` — the opening asked for the _subjects_ of tests (criterion 2);
  criterion 1, "tests behaviour not internals", was the un-probed one and nothing asked it.
- `react-state-placement` — the cut dropped "why there", which criterion 1's level 3 requires.
- `telling-a-user-the-form-failed` — "where do the messages appear" takes a four-word answer.
- `stuck-and-asked-for-help` — the opening lost the word "asked", so both probes presumed a story the
  candidate may not have told. The nervous-candidate pass and the senior-interviewer pass made this
  their single most important finding, from opposite directions.

**Two questions had their opening and first probe swapped** — `it-works-for-me`, whose criterion is
literally "looks _before_ spending the reporter's time" and whose probe staged the looking as
happening after the reply had been asked for; and `state-that-can-disagree`, which asked for the
redesign and then probed the diagnosis. This is the same order-of-work defect the QA pilot found.

**Ten probes handed over the thing their criterion scores.** "What does your code have to do to
notice?" tells a candidate that `fetch` does not notice on its own, which is the 40%. "Once you have
reproduced it…" hands over the reproduction that the un-probed 40% criterion scores. "Is an index
ever a reasonable key?" concedes the answer to the un-probed criterion 1. All reworded to walk the
candidate to the same place without naming it.

### The ten two-probe criteria

`js-async-ordering` 3 · `slow-page-on-3g` 3 · `js-copy-or-reference` 3 · `react-list-key-mixup` 3 ·
`the-overnight-blocker` 2 · `retry-and-the-double-charge` 2 · `stale-after-saving` 2 ·
`telling-a-user-the-form-failed` 2 · `angular-view-did-not-update` 3 · `something-you-built` 3 ·
`state-that-can-disagree` 3. Each is a criterion whose description joins two separable things with
"and", where a single probe left the discriminating half scored and never asked. None carries three.

### Recorded rather than applied — all of it rubric work

The fairness pass counted the protective clauses that let a candidate with no workplace, no
colleagues and no paid tooling score what they know: **eleven in `rubrics.shared.yaml`, two in
`frontend/rubrics.yaml` across ninety criteria.** That asymmetry was survivable while a prompt asked
three things at once and a candidate could answer around the one they had no standing to answer.
**The planned-follow-up field removes exactly that escape route, by design** — so every criterion
that quietly assumed a workplace is now asked by name, of the candidate who did not volunteer it.
Six descriptors need one sentence each (`help-seeking-judgement` 3, `test-brittleness-diagnosis` 2,
`performance-investigation` 2, `semantic-html-diagnosis` 3, `secret-exposure-diagnosis` 3,
`resilient-layout-reasoning` 3), and three level descriptors have been made unreachable by the
format itself — `state-placement-reasoning` 2 level 1 ("notices the duplication **only when
prompted**", when the prompting is now built in), `url-state-reasoning` 3 level 0, and
`client-boundary-reasoning` 2 level 0. Changing a descriptor moves scoring and invalidates the
stress answers written against it, so it is the owner's call, not this pass's.

## Appendix B4 — the fairness clauses and the dead descriptors (2026-09-24)

Appendix B3 ended by handing nine descriptor changes to the owner, because changing a descriptor
moves scoring. All nine were approved and are applied here. **No question changed in this pass** —
one prompt, one set of `ideal_points` and two `reviewer_notes` did, and the rest is rubric work.

### The six criteria that assumed a workplace

Each gained one sentence in its `description` saying what it is scored on and what it is not, and,
where the assumption had reached the ladder, a level descriptor reworded to match. The rule is now
in the skill: a criterion that assumes a workplace needs a route for someone without one.

| Criterion                           | What it assumed                     | The route it now states                                        |
| ----------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| `help-seeking-judgement` 3 (shared) | somebody at work to ask             | asking is reaching outward by whatever route was open          |
| `test-brittleness-diagnosis` 2      | having lived with a suite on a team | reasoning the cost out scores the same as having felt it       |
| `performance-investigation` 2       | having used the Performance panel   | describing what to look at scores the same as naming the panel |
| `semantic-html-diagnosis` 3         | standing to argue with a design     | knowing the element is chosen for meaning, said or not         |
| `secret-exposure-diagnosis` 3       | holding the provider's credentials  | saying who has to rotate it scores the same as doing it        |
| `resilient-layout-reasoning` 3      | production content to test against  | inventing the worst case scores the same as finding it         |

`help-seeking-judgement` is the widest of the six and the reason it was first: 40% of its question,
and the criterion **is** the act. So the act was widened rather than its absence excused — a
community, a group chat, an issue thread, a question posted where strangers would see it. That is
now a rule in the skill too, and the change reaches four banks, because the rubric is shared.

### The three descriptors the probes had killed

Each was defined by the absence of something its own probe supplies, so no candidate the probe
reached could land on it.

- `state-placement-reasoning` 2 level 1 — "notices the duplication only when prompted", when the
  probe _is_ the prompting. Now the answer that keeps both copies and proposes keeping them in
  step, which is the real junior answer that sits between not noticing and not generalising.
- `url-state-reasoning` 3 level 0 — "would put everything in the URL, or nothing", when the probe
  asks what they would leave out. Now: draws no line, or would keep the filter itself out of it.
- `client-boundary-reasoning` 2 level 0 — "sees no cost", when the probe says the rest of the page
  is affected. Now: names no cost, or answers about what the button can do rather than what the
  page pays.

### The stress run

`check-stress.mjs` was re-run over all 103 sets and every separation still passes; no score moved.
One stress answer was rewritten rather than re-scored: `help-seeking-judgement`'s
`correct-poorly-explained` candidate asked a team lead, so nothing in the set exercised the
widening. They are now self-taught and ask in their cohort's WhatsApp group, with the same substance
said just as badly, and still score 3 / 3 / 3. A rubric change that no stress answer reaches is
untested, which is worth remembering the next time a clause is added rather than a level.

## Appendix B5 — the depth cue on diagnosis openings (2026-09-25)

The owner's decision 2 on the backend retrofit
(`docs/progress/2026-09-25-backend-probes.md`), applied across all three banks in one pass.
**26 of frontend's 35 prompts gained a closing cue; no opening was rewritten and no criterion
moved.** Handover: `docs/progress/2026-09-25-depth-cues.md`.

A one-clause opening tells a candidate _what_ is wanted and nothing about _how much_. The old
triple-barrelled prompts carried the shape of the answer as a side effect of carrying its content;
cutting them to one clause in the retrofit took the shape away with it. The cue restores it and asks
for nothing new.

**Which cue, by a rule rather than by ear** — three forms, so that a candidate hearing five
questions in one session does not hear the same sentence five times:

| Cue                             | When                                                                                                                      | Frontend |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| "Walk me through what you see." | there is a snippet or screen, and the prompt has not already pointed at it                                                | 7        |
| "Walk me through it."           | there is a snippet or screen and the prompt points at it ("This is the CSS…", "Have a look…") — "what you see" would echo | 9        |
| "Take me through it."           | nothing on screen                                                                                                         | 10       |

**Where the line was drawn, and this is the judgement to check.** A cue went on a question whose
opening asks the candidate to work out **why** something is as it is, or what is wrong with what is
in front of them. It did not go on:

- **design and enumeration openings** — `fetch-failure-states` ("what else does that screen have to
  show?"), `telling-a-user-the-form-failed`, `react-state-placement`. "What else" already invites a
  list, which is the shape the cue exists to supply.
- **behavioural openings** — `stuck-and-asked-for-help`, `feedback-on-your-code`. "Tell me about a
  time…" is a narrative directive and carries its own shape. The one exception in any bank is
  `incident-you-contributed-to`, which already carried "Take me through it." from the backend pass.
- **artefact openings** — `the-overnight-blocker` ("Tell me what you would write"), which names the
  thing to produce.
- **openings that already walk** — `js-copy-or-reference` ("Walk me through what is actually
  happening"), `what-to-test-on-a-login-screen`, `something-you-built`. The cue is already the ask.

**`check-bank.mjs` no longer counts a cue as an ask.** It would otherwise hand every diagnosis
question a free ask and let a criterion go unasked behind it, which is the one thing that count
exists to catch. The recognised cues are a closed list; anything with a noun in it is the ask.

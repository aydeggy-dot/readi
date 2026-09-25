# The question-bank programme — closing handover

**Branch `content/catalogue-banks`, opened 2026-09-22, closed 2026-09-25. 31 commits.** Written at
the point the owner stopped content work to merge and start M3. It supersedes nothing: the
per-pass handovers listed at the end remain the record of *why*; this is the record of *what exists*.

**Everything below is `status: draft` / `author: ai_draft`.** No candidate has seen any of it. Four
rows are published in the owner's local database only, which is a dev artefact and not a state of the
branch. The production publish guard (ADR-0014 decision 6) refuses a marked item unless an admin
passes `acknowledge_unreviewed`, so nothing here can reach a candidate before a human vouches for it.

---

## 1. What exists

`content/seed` holds **4 roles · 3 levels · 23 stacks · 29 topics · 102 rubrics (306 criteria) ·
104 questions · 225 planned follow-ups · 3 tracks**, plus **102 stress-test answer sets** under
`evals/datasets/synthetic/` and **14 blueprints** covering every role in the catalogue through
wave 4.

### Per role — what a candidate is actually offered

A question can carry more than one role, so these overlap and do not sum to 104.

| Role       | Offered | General | Stack-tagged | Own bank | Rubrics                  |
| ---------- | ------- | ------- | ------------ | -------- | ------------------------ |
| Frontend   | 40      | 29      | 11           | 35       | 30 + 10 shared           |
| Backend    | 38      | 29      | 9            | 34       | 29 + 10 shared           |
| QA         | 45      | 35      | 10           | 35       | 33 + 10 shared           |
| Full-stack | **65**  | 52      | 13           | **0**    | borrowed with the questions |

Full-stack has no bank and should not get one (ADR-0015 / `blueprints/fullstack.md`): it is the
frontend and backend questions that transfer, each carrying `fullstack` as a second role, plus three
from QA. Every general frontend and backend question transfers; the seven that do not are tagged for
Angular, vanilla JavaScript or Java + Spring, which this role does not offer.

### Per role × level — and the holes

| Role × level               | Questions (general) | Track                        |
| -------------------------- | ------------------- | ---------------------------- |
| Frontend · intern-junior   | 37 (26)             | **yes** — 3 modules, 6 lessons |
| Frontend · mid             | 36 (25)             | **none** — `track_not_found` |
| Backend · intern-junior    | 18 (14)             | **none** — `track_not_found` |
| Backend · mid              | 37 (28)             | **yes** — 1 module, 2 lessons |
| QA · intern-junior         | 27 (25)             | **yes** — 1 module, 2 lessons |
| QA · mid                   | 41 (31)             | **none** — `track_not_found` |
| Full-stack · intern-junior | 45 (35)             | **none** — `track_not_found` |
| Full-stack · mid           | 61 (48)             | **none** — `track_not_found` |

**Five of the eight combinations have no track**, which is the largest single hole the programme
leaves and the one `check-bank.mjs` reports every run. A candidate there gets `track_not_found`
today. This was named on day one and never closed: the passes wrote questions, and a track is
lessons.

**Backend at intern-junior is the thinnest set** — 18 against frontend's 37 — because the owner
decided (2026-09-23) to set a question's level per question and let the floor report a shortfall
rather than meet it with a mid question wearing a junior label. `async-work`, `concurrency`,
`backend-reliability`, `backend-testing` and `observability` are all short at that level and the
checker names each one.

### Stack variants

`nextjs` 8 · `react-node` 6 · `laravel-vue` 4 · `django-react` 1 · `ruby-rails` 0 ·
`dotnet-react` 0 for full-stack; the specialist variants are fuller. The three shortfalls can only be
closed by writing — there is no Rails or .NET question in any bank, and the one re-tag that would
have closed `django-react` was declined because the snippet is FastAPI and `django-react` means
Django.

### Version-sensitive claims

**24 questions** carry a `**Version-sensitive: … checked against … on YYYY-MM-DD.**` line — 6
frontend, 8 backend, 10 QA. `grep -o '\*\*Version-sensitive:[^*]*' content/seed/*/questions.yaml`
prints the claims and their dates; the detail is in each blueprint's Appendix A. These are the first
thing to re-check on any later pass, and the AI/LLM bank (wave 2) carries an extra rule for the same
reason: no model names, no prices, no context-window sizes, no benchmark numbers.

---

## 2. What the skill learned

`.claude/skills/question-bank/` is the durable output — arguably more valuable than the banks, since
it is what makes the twentieth role as good as the first. It grew from a procedure into about thirty
hard rules, each with its source. The ones that changed the most work:

**On prompts and probes** (the largest single reshape — three retrofits across all 104 questions:
225 probes written, QA's 35 and backend's 34 prompts cut to one clause, 13 frontend openings
re-aimed, and 54 diagnosis openings given a depth cue):

- **One question asks one thing**, and every other criterion carries a probe in
  `planned_follow_ups`. The triple-barrelled prompt was pre-empting the engine's own follow-ups.
- **A prompt cut to its first clause is not a prompt cut to its first criterion.** Run the mis-aim
  check first: per question, name the criterion the opening asks and check it is the one without a
  probe. It changed 13 frontend openings and 8 backend ones that a mechanical cut would have got
  wrong — and there is no check behind it, because no lexical test can tell which criterion an
  opening names.
- **A probe must not name what its criterion scores, and this is worse than the clause it replaced.**
  A clause was asked of everyone; a probe is asked only of the candidate who missed that criterion,
  so a leading probe converts a miss into a gift to precisely the person who had not earned it.
  Eleven of seventy backend probes were rewritten on this in one pass.
- **A diagnosis question opens on the diagnosis** (owner, 2026-09-25) — a candidate cannot decide
  about a bug they have not diagnosed — **and it gets a depth cue**, because a one-clause opening
  says *what* is wanted and nothing about *how much*.

**On rubrics:**

- **Weights are a claim, not a template.** QA was drafted with 21 of 30 rubrics at exactly 35/35/30;
  the consequence is that the judgement which actually transfers ends up the lightest criterion,
  because it is written last. Now a check.
- **Name the belief, never the manner — and never the quantity either.** "Confidently" was the first
  form, "articulate" the second, and "a detailed plan", "a thorough set of flows", "prices it
  accurately" the third, which is the one a lexical check nearly missed: a terse correct answer in a
  second language matches neither that level 1 nor the level 3 above it and drifts down.
- **A level 0 reading only "Not addressed." is silence, not a wrong answer.** 22 rewritten over two
  days. Once a probe asks the criterion by name, that band stops describing anything and becomes the
  bin an evaluator drops what it cannot place into — with an evidence quote contradicting the
  descriptor it was scored against.
- **Put the thing you would hire on at level 3, not level 4**, and **level 4 must contain something
  that cannot be bluffed.**
- **A protective clause belongs on a behavioural criterion and rarely anywhere else.** A scenario
  prompt supplies the workplace; the bug is a criterion that requires the candidate to have *had*
  one. This is why the mechanical clause-count signal overstated the backend gap so badly.
- **A rubric change must not evict the case it already had**, and **when a rubric changes to include
  a case, the stress set needs an answer from that case** or the change is untested.

**On method:**

- **A rule that has to be remembered once per instance is a rule that needs a check.** Written down,
  then broken eighteen times in the next bank by the same drafter. `check-bank.mjs` grew from that
  sentence: it now enforces the ask count, descriptor distinguishability, silent level 0s, manner and
  quantity words, weight templates, slug resolution and the blueprint targets — **and it reports
  nothing about the two rules that most need it**, the mis-aim check and the depth cue, because both
  need an opening read as prose.
- **Run the critique passes separately and check every finding against the file.** In the QA/backend
  fairness sweep, **five of fifteen findings did not survive that check.** That ratio is the argument
  both for running the passes and for never applying them mechanically.
- **A blueprint before a bank.** Without one a bank becomes "the questions the drafter found
  interesting", and the gap is invisible until someone counts.

---

## 3. Every open question, and who it is for

### For the expert reviewers — the pages are ready

`content/seed/review/{frontend,backend,qa,fullstack}.md`, regenerated by
`pnpm --filter @readi/api content:review-doc`. They print and render on GitHub.
`content/seed/REVIEW.md` is the covering note and asks seven things; §7 (does this belong to
full-stack?) now states the real 65 of 104 and names the two things the tagging pass is least sure
of. **A page is every question that role's candidates are asked, not the questions in its
directory** — that was a bug until 2026-09-25, and a QA reviewer would have signed off 35 questions
while their candidates were offered 45.

Beyond the seven standing asks, these are flagged in the pages and in `reviewer_notes`:

1. **Fourteen backend probes are some form of "What would you change?"** The senior pass declined to
   call it a defect and flagged it anyway. Left, with the argument for leaving it stated.
2. **`status-code-honesty` at `intern-junior`** — left flagged rather than changed.
3. **`what-to-test-when-there-is-no-time` opens "There are forty test cases you would normally
   run"**, which a full-stack developer at a startup does not have. Answerable, but it may read as a
   QA role-play to the role it has just been given to.
4. **`the-field-that-changed-shape` criterion 1 level 4** rewards saying the app was not at fault,
   which is a political statement in some teams.
5. **The behavioural share is 4 of 35 in frontend.** A remote reviewer argued for nearer 40% of a
   bank; an interviewer here said about one in four of an hour. Both additions the coverage appendix
   proposes would take it to six.
6. **Three banks' `reviewer_notes` have never been swept** for flags that are a known defect rather
   than a question for an expert. The two kinds are distinguishable — "is this the right weight?" is
   judgement, "this descriptor still assumes X" is a bug with a known fix — and one of the second
   kind capped an honest answer at 2 on a 35% criterion for three days before anyone acted on it.
   **This is the highest-value unstarted item in the programme.**

### For M4 — a content decision is waiting on it

**"Needed no prompting" is a signal we currently throw away.** If a prompted answer scores slightly
below a volunteered one, then "the heaviest criterion sits behind a probe" — true in nine backend
questions, and the guaranteed-asked share averages 36.8% — **largely dissolves across all three
banks with no prompt rewritten**. `SessionTurn.follow_up_index` already carries the data. Until M4
answers it, the snippet openings stay as they are (owner, 2026-09-25).

### For the owner — decided and recorded, not open

- Snippet openings are **not** inverted; a candidate cannot decide about a bug they have not
  diagnosed, and "what would you change?" rewards pattern-matching on a snippet's shape.
- `test_design` stays **off** `fullstack`, so QA's three "What would you test?" questions cannot
  carry the role. Three crossovers are enough.
- The stress sets are rewritten against the probes **once**, not three times — see below.

---

## 4. What the next content pass should cover

In the order the dependencies fall, not in order of size.

1. **The `reviewer_notes` sweep** — over all four files, sorting each flag into *fix* or *escalate*
   and saying which in the blueprint. Needs nothing else to exist first, and it is the item most
   likely to be hiding a live defect.
2. **The stress-set rewrite** — all 102 sets, every answer written against the **whole exchange**
   (opening plus the probes it would earn), because a descriptor whose meaning depends on a probe
   having been asked cannot be confirmed by an answer that only meets the opening. Now unblocked:
   all three banks are retrofitted and the full-stack pass has landed. Two known additions to its
   scope: an answer for `help-seeking-judgement` from a candidate with nobody to ask, and one for
   `api-contract-reasoning` from a candidate who owns both ends. The depth cues add nothing — a cue
   changes no descriptor.
3. **The five missing tracks**, starting with whichever level M4 shows most traffic on. Questions
   without lessons are half a product, and `track_not_found` is what a candidate actually sees.
4. **The full-stack role's own content** — a skeleton track at `intern-junior`, the ~8 boundary
   questions (`fullstack-boundary` 0 of 5, `deployment-basics` 0 of 4), and the three variant
   shortfalls. **Deliberately deferred** (owner, 2026-09-25) until M4 shows real scoring and the
   experts' first round is back, so that eight new questions are not drafted against the same
   unvalidated assumptions a third time. `the-field-that-changed-shape` is the stand-in meanwhile.
5. **Backend at intern-junior**, which is 18 questions against frontend's 37 and short on five core
   topics at that level.
6. **Wave 2** — AI/LLM engineer, then DevOps/Cloud, then Mobile, each from its blueprint, each
   needing its role, stacks and topics added to the catalogue files first. **Data analyst is blueprint
   only and does not launch until there is a SQL practice surface**; specifying that surface is the
   first task of its wave, not an afterthought at the end.

**None of it is a migration.** Adding a role is a content task (ADR-0015); if a new role needs a code
change, that is a bug in the code rather than a step in the task.

---

## 5. Verification, and how to re-run it

```bash
node .claude/skills/question-bank/scripts/check-bank.mjs           # no errors, 53 warnings
node .claude/skills/question-bank/scripts/check-bank.mjs --strict  # shortfalls become errors
node .claude/skills/question-bank/scripts/check-stress.mjs         # 102 sets, 20 calibration notes
pnpm db:seed -- --dry-run                                          # the contract, against the database
pnpm --filter @readi/api content:review-doc                        # regenerates every role's page
pnpm format && pnpm lint && pnpm typecheck && pnpm --filter @readi/api test
```

**The 53 warnings are the baseline and every pass since 2026-09-24 has been diffed against it rather
than eyeballed.** They are, in full: the five role × level combinations with no track, the topic and
variant shortfalls named above, and the eight wave-2/3 blueprints whose roles are not in
`roles.yaml` yet (planning only). A pass that changes the count has changed something it should
explain.

## 6. The record

| Pass                                   | Handover                                          |
| -------------------------------------- | ------------------------------------------------- |
| Frontend and backend banks             | `2026-09-22-question-banks.md`                    |
| QA bank                                | `2026-09-23-qa-bank.md`                           |
| Planned follow-ups — decision and pilot| `2026-09-23-planned-follow-ups.md`, `…-pilot.md`  |
| Frontend retrofit                      | `2026-09-24-frontend-probes.md`                   |
| Frontend rubric fairness               | `2026-09-24-rubric-fairness.md`                   |
| QA and backend fairness sweep          | `2026-09-25-fairness-sweep-qa-backend.md`         |
| Backend retrofit                       | `2026-09-25-backend-probes.md`                    |
| Depth cues                             | `2026-09-25-depth-cues.md`                        |
| Full-stack tagging                     | `2026-09-25-fullstack-tagging.md`                 |

The plan is `docs/plans/content-catalogue-banks.md`; the method is
`.claude/skills/question-bank/SKILL.md`; per-role detail is in each `content/seed/blueprints/*.md`
appendix; the working list is `tasks/todo.md`.

# The fairness sweep of QA and backend (handover)

**Branch `content/catalogue-banks`, 2026-09-25.** The todo item between the frontend fairness pass
(`docs/progress/2026-09-24-rubric-fairness.md`) and the backend planned-follow-up retrofit: check the
other two banks for the two gaps the frontend pass found — criteria that assume a workplace, and
level 0 or 1 descriptors a probe has made unreachable. Nothing is published; every seed file is still
`status: draft` / `author: ai_draft`. **Next: the backend retrofit (68 probes).**

## How it was run

Two fairness passes, one per bank, each a separate subagent with its own brief and nothing about the
other — `references/critique.md` pass 4, narrowed to the two gaps. They read 87 backend criteria and
99 QA criteria plus all 74 QA probes and returned 15 findings against named slugs. **Every finding
was then checked against the file before anything was changed, and five did not survive that check.**
That ratio is the argument for running the passes and for not applying them mechanically.

`rubrics.shared.yaml` was read separately, by hand, because both banks depend on it.

## The pattern worth keeping

**A protective clause belongs on a behavioural criterion, and rarely anywhere else.** A scenario or
technical prompt supplies the workplace — the report on screen, the snippet, the provider outage —
and a rubric written in the hypothetical ("what they would do") needs no route however much workplace
furniture it mentions. The bug is a criterion that requires the candidate to have **had** one: a
past-tense criterion, or a level reachable only by recalling a real job. That is why the mechanical
signal (eleven clauses in `rubrics.shared.yaml`, none detected in backend) overstated the problem so
badly: 34 of QA's 35 questions and nearly all of backend's hand the candidate an artefact instead of
asking for recall. The shared file is where the behavioural questions live, which is why it is the
best-covered file in the repo.

## What was found and fixed

### One finding of my own, ahead of the passes — and it is now a check

**A level 0 reading only "Not addressed." is silence, not a wrong answer.** It described a real
situation while a prompt asked three things at once and the candidate answered two of them; a probe
removes that situation, so the band stops describing a wrong answer and becomes the dustbin an
evaluator drops anything it cannot place into — with an evidence quote that then contradicts the
descriptor it was scored against. Eleven rewritten (ten QA, one frontend); eight more in backend are
warnings today and become errors at its retrofit. `check-bank.mjs` enforces it: an error on a probed
criterion, a warning elsewhere. Committed separately as `7ea284f`.

### Backend — 7 reported, 3 applied

- **`alerting-judgement` criterion 3 (35%).** The real one. Its protective clause and its level 1
  collided: "it emails me" was simultaneously the level-3 route ("even if that is only themselves")
  and the level-1 failure ("an email nobody reads"), so the evaluator had to guess. The drafter asked
  this exact question in `reviewer_notes` — "Does that actually hold? It is the difference between
  scoring judgement and scoring employment" — and the answer was no. Level 1 is now about there being
  no account of who reads it or when, not about the channel.
- **`unfamiliar-code-approach` criterion 2 (35%, shared).** The one shared rubric scoring a backend
  question with no clause on any of its three criteria, and it is past-tense recall. Two of its three
  level-3 routes needed a suite somebody maintained or a person who knew. The question's own widening
  ("a tutorial project, a library, something at work, anything") is in the **prompt**, where a probe
  will not carry it. The route is now in level 3, where it is a score rather than guidance, and level
  4's "whoever reads it next" is now "themselves in six months included".
- **`worker-deploy-diagnosis` criterion 3 (25%).** Caps nobody, but its dimension read "Makes the
  **next person's** version visible" — the first text the evaluator reads, naming a colleague the
  candidate may not have. Now "Makes the running version visible". The eval file's dimension strings
  moved with it, because `check-stress.mjs` matches them.

**Four not applied, and why.** `status-code-honesty` 3, `cache-key-diagnosis` 3,
`duplicate-job-reasoning` 3, `test-isolation-diagnosis` 2. The first is knowledge, not experience —
you can know a cache keys on a 200 without having deployed behind one — and the pass applied exactly
that standard to reject `collection-endpoint-design`, so it is inconsistent with itself. The other
three already carry their route ("or taking it straight to whoever owns that", "by whoever the right
person is") or are supplied by the prompt. **The drafter had already recorded a worry on all four**,
as an expert judgement rather than a defect, which is where they should stay.

### QA — 8 reported on 6 criteria, 5 applied plus 2 precision rewrites

- **`api-evidence-reading` criterion 2 (35%) — the worst of the sweep.** The route for a candidate
  with no contract to check sat in **level 4**, gated behind a level 3 that requires one. The honest
  answer — "there is probably no spec; I would go on what the app and the other endpoints send" —
  capped at 2 on a 35% criterion, and could not reach the band written for it. The drafter flagged it
  ("the descriptors may still read as assuming one") and the fix was never applied. The route is now
  in level 3, and level 4 gets a real increment back: treating a missing agreement as a finding in
  its own right rather than an obstacle to work around.
- **`rule-interaction-test-design` criterion 3 (40%)** — the probe hands over the Resend/old-code
  collision, so both bottom bands were defined by never having met it. The whole ladder moved up one:
  level 2 is now "reaches one interaction beyond the one they were given".
- **`transactional-test-design` criterion 2 (35%)** — level 0 was "every request either succeeds or
  fails" against a probe that supplies the timeout and the double tap.
- **`raising-a-quality-concern` criterion 3 (25%)** — level 4 needed somebody to have ruled against
  them, in a rubric whose criterion 2 explicitly admits a candidate with nobody to tell. It now has
  "or, with nobody to rule either way, what would have changed their own mind".
- Two level-1 rewrites for precision (`test-case-selection` 3, `raising-a-quality-concern` 3): what
  the wrong answer sounds like **after** the probe, not before it.

**Three not applied.** `oracle-reasoning` criterion 2's level 0 and level 1 were reported dead; both
are reachable — asked "what would you point at", a candidate can still say "it is a matter of taste"
or "I would ask the developer", and people answer the question they wanted rather than the one asked.
Likewise the level-1 claims on `transactional-test-design` and `api-evidence-reading`: a probe
weakens those bands, it does not kill them. The pass also listed six more criteria with "only level 0
killed" — spot-checked and not confirmed; each names a wrong answer a probed candidate can still give.

## The thing that caught me out, and it is the rule from last time

**Three of my own rewrites would have stranded an existing stress answer.** Narrowing a level 1 to
the post-probe wrong answer left the answer that used to land there with nowhere to go — on
`rule-interaction-test-design` the `weak` answer tests Resend as its own case and never meets the
collision at all. All three were widened to hold both shapes. The lesson is the mirror of the rule
written on 2026-09-24: a rubric change needs an answer from the case it now includes, **and** it must
not quietly evict the case it already had. Check both directions against the set before committing.

Two stress answers were rewritten so the new routes are exercised rather than merely present:
`alerting-judgement`'s `correct-poorly-explained` candidate now has no rota and the alert goes to
their own phone, and `api-evidence-reading`'s has no contract and settles the field name against the
other callers. Both still score exactly what they scored before.

## Left for the owner

1. **The QA stress sets were written before the probes existed and were never revisited.** Where a
   descriptor's meaning now depends on the probe having been asked, the set cannot confirm it — the
   `weak` answer on `rule-interaction-test-design` answers the opening alone. This is not wrong,
   exactly: a weak answer failing to cover a probed point is legitimate. But it means the QA sets
   test the rubrics as they were, not as the engine will use them. A pass over the 33 QA sets to
   write each answer against the whole exchange is a real job and it is not this one.
2. **`status-code-honesty` at `intern-junior`** is a level judgement rather than a fairness one, and
   worth a reviewer's opinion: the criterion's subject is what sits between an app and a server, and
   it is 30% of a question offered to juniors.
3. **No QA question carries `fullstack`** — 31 of frontend's 35 and 31 of backend's 34 do. The held
   tagging pass should say whether that is right.

## Checks

`check-bank.mjs` (no errors; **61 warnings** — the 53 from before, plus the eight backend
silent-level-0 warnings that become errors at the retrofit), `check-stress.mjs` (103 sets, every
separation passes, no score moved), `pnpm db:seed -- --dry-run`, `content:review-doc`, `format`,
`lint`, `typecheck`, 375 API tests and 91 shared-types.

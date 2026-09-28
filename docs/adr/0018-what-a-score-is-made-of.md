# ADR-0018 — What a score is made of: three columns, two adjustments, and the facts they are keyed on

**Status:** Accepted
**Date:** 2026-09-29 (recording decisions taken 2026-09-26 to 2026-09-28)
**Milestone:** M4

## Context

Spec §6.2 said the whole of it in one sentence: "Overall = weighted average of criteria scaled to
0–100 (computed in code)." Building M4 found three places where that sentence is not enough, and each
was settled by the owner as it arrived. They are written across `CLAUDE.md`, the spec and four
handovers; a reviewer asking "why is this candidate's score what it is?" should not have to assemble
the answer from those. This ADR is the assembled answer.

The pressure behind all three is product principle 1: feedback must be specific, cite what the
candidate said, and be **fair** — and a candidate must be able to check the number against their own
transcript. That is the test every decision below had to pass.

## Decision

### 1. A score is three columns, not one

`answer_evaluations` keeps all three, and they are for three different readers.

| column | what it is | who reads it |
| --- | --- | --- |
| `criteria` | the model's per-criterion reading, untouched | `/evals`, calibration |
| `overall_raw` | those scores weighted by the **pinned** rubric | nobody, directly — it is the control |
| `overall` | `overall_raw` after the adjustments below | the candidate |

`/evals` compares a human to `criteria`, because that is what a human scores; a harness measuring the
model against our arithmetic would be measuring the wrong thing, and a change to the arithmetic would
show up as the model getting better or worse. `SCORING_VERSION` versions **our arithmetic**, not the
model — which is why it is separate from `PROMPT_VERSIONS` and from the evaluator's model name.

### 2. A criterion the engine had to ask about contributes at 0.85 of its weight

Owner's decision, 2026-09-26. `scoring.ts`, `prompting.ts`.

An answer that only reached a criterion because the interviewer probed for it is not the same as one
that volunteered it. The discount is small, and three things about how it is applied are the decision:

- **On any non-zero score, rather than as a curve.** A candidate can check "you lose a little for
  needing the nudge" against their own transcript. A curve is not checkable.
- **On the numerator only**, so it can never raise a score. Applied to both sides it would *increase*
  a prompted criterion's contribution, which is the kind of arithmetic a candidate finds before we
  do.
- **Keyed on the engine fact** — which probes were really asked, as `session_turns.follow_up_index`
  records them — and never on the coverage model's private verdict. M3 wrote that the coverage
  judgement may reach the evaluator "as a prior and never as a score", and this is the same line: a
  candidate can argue with a probe in their transcript and cannot argue with a flag a model set about
  them.

The menu is read **per probe** and collapsed to a set of criteria at the end, because a criterion may
carry two probes; anything keyed by criterion drops the second, which `review-doc.ts` really did.

### 3. A criterion the interview never asked about is not assessed, and leaves the denominator

Owner's decision, 2026-09-27. `SCORING_VERSION` 2.

Two facts are required, from two places:

1. the **engine fact** that the criterion carries probes and the interview asked none of them
   (`unaskedCriteria`, the exact complement of `promptedCriteria` over the criteria that have probes);
2. the **model's own reading** that the answer did not reach it — a 0 with no evidence, which spec
   §6.2 already defines as "never addressed at all".

A candidate who volunteered it unasked is scored on it as normal, and so is one who addressed it and
was wrong — that is the 0 *with* a quote. Any reason counts for the exclusion: the clock, an early
end, or the follow-up cap spent elsewhere. It never excludes the whole rubric.

**The report has to admit it.** `CandidateQuestionReport.not_assessed` names those criteria by
`dimension`, and a criterion is in exactly one of `criteria` and that list. A score assembled over two
of three criteria that does not say which one is missing cannot be checked against the transcript,
which is the whole basis of the report.

This is the mirror of the 0.85: that protects a candidate who **needed** a nudge, and there was
nothing at all for one who was never **offered** one. The first paid run's fourth answer lost 30
points that way and neither the report nor the transcript could say where.

### 4. The evaluator is told whether the interview asked, and it may not move a score

`asked_about` on `EvaluationCriterion` is the one engine fact the model is given, because its prose is
printed in the report and a model that does not know the interview ran out of time tells the candidate
off for not answering a question nobody asked. "Volunteered or prompted" stays hidden, because that is
a *grading* fact; "asked at all" does not, because it is a fact about us. The exclusion itself is
arithmetic in `scoring.ts`, on the two facts above — never on what the model does with the label.

### 5. The report is assembled from the per-answer JSON in code

`report-assembly.ts`, pure. Not a second free-form model call: the top three strengths come from the
answers that went best and the top three fixes from the ones that went worst, chosen in code, so the
list is reproducible and cannot flatter. Spec §4.4's "per-dimension scores" is corrected to aggregates
**by topic and by question type**, because a rubric's dimensions are prose written for one question
and do not aggregate across a session.

### 6. A session is scored against what it was run against, not against what the content says now

Everything above reads `interview_session_questions.snapshot`. A session lasts fifteen to thirty
minutes and an expert can rework a rubric inside that window, so both the report's words and its
number come from the pin. `interview-pinning.int.spec.ts` is the test and it has been watched failing
in both halves.

## Consequences

- **A candidate can derive their own score.** Every input is either in their transcript (which probes
  were asked, what they said) or in the report (which criteria were assessed, what a strong answer
  covers). That is the property all three decisions were chosen for, and the reason none of them is
  keyed on a model's private judgement.
- **`overall` and `overall_raw` will disagree**, sometimes by a lot, and anybody comparing a score
  across releases has to compare like with like. `SCORING_VERSION` is how.
- **`/evals` cannot see either adjustment**, by design. A regression in the arithmetic is caught by
  `scoring.spec.ts`'s worked examples, not by the harness.
- **Three of the four rules fail silently if restated.** The prompting menu read per criterion instead
  of per probe, the exclusion keyed on the coverage verdict instead of the engine fact, or the report
  omitting `not_assessed` would each produce a plausible number and a wrong one. They live in one
  place each and are tested by worked arithmetic rather than by fixtures.

## Alternatives considered

- **One column.** Rejected: `/evals` would then measure the model against our arithmetic, and a change
  to the discount would look like the evaluator drifting.
- **A curve or a flat penalty for prompting**, instead of 0.85 on the numerator. Rejected as
  uncheckable — a candidate cannot verify a curve against their transcript.
- **Scoring an unasked criterion 0.** This is what M4 shipped with until 2026-09-27 and what the first
  paid run exposed: a candidate lost 30 points for a question nobody asked them, invisibly.
- **Excluding on the coverage model's verdict alone**, which would have been one fact instead of two.
  Rejected: it is a private judgement the candidate cannot see or argue with, and M3 had already ruled
  that it may never act as a score.
- **Letting the evaluator apply the adjustments**, having been told `asked_about`. Rejected: the
  arithmetic has to be re-derivable in code from stored facts, and a model asked to discount a score
  by 15% will not do it consistently.

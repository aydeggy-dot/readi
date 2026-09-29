# P0 — the pilot (a saved plan, not scheduled)

**Status: saved, postponed by the owner on 2026-09-29.** Nothing here is being built. This file
exists so that the things only a pilot can settle are written down in one place, with what each of
them is blocked on, rather than scattered across seven M4 handovers. When the pilot happens, this is
the starting point; until then it is a reading list for anyone about to quote a number.

It is **P0** and not **M5** on purpose: it is not a milestone of code. Almost all the machinery it
needs already exists — the calibration tool, the gold-set loader, `interviews:pace`, the harness's
`--dataset gold` — and what is missing is **real candidates, consenting**. See the M4 milestone
handover (`docs/progress/2026-09-29-m4.md`, "What is not proven") for the evidence behind every claim
below.

## What the pilot is

A small number of real candidates — Nigerian, on their own devices and connections — completing real
interviews, with `transcript_review` consent, so that a person can read what they said and score it.
It is a measurement exercise with a product wrapped round it, not a launch: no payments, no
marketing, no public sign-up.

## The five things that stay unvalidated until it happens

| | The claim as it stands today | Why only a pilot can settle it |
| --- | --- | --- |
| **1. Fairness on real Nigerian English** | 0 of 36 criteria outside the one-rung band — against `nigerian-english` answers **written by the same family of model that then scored them**. | The drafter may have written an idiom milder or more literary than candidates actually use, and a model may read its own register more charitably than a person's. No amount of sampling from the synthetic set can detect either (CLAUDE.md product principle 3). |
| **2. The gold set** | `evals/datasets/gold` is empty; every agreement figure (80–87% exact) is against **model-written** expectations, which is a regression baseline and evidence about drift, not about quality. `thresholds.yaml` is enforced `on_provenance: human` so it cannot quietly start passing. | Human-scored answers. The format and the loader are there; the answers are not. |
| **3. Answer pace and `SECONDS_FOR_A_FOLLOW_UP`** | 75 s, **provisional on eight follow-up answers** (was 45; `interviews:pace` found the median at 61 s with five of eight past 45). | The figure to re-read is "follow-up answers that ran past it", and the report refuses to read as a constant under 40 answers. Four real sessions is what there is. |
| **4. The evaluator model** | `claude-opus-5` for the MVP, agreed 2026-09-28 — opus agrees with the written expectations at 84% exact against sonnet's 73%, at four times the price (40.3¢ against 10.1¢ per 30-minute session). | Those expectations are model-written, so the tie-breaker is "agrees with a model". On a gold set that stops being true, and the price difference is large enough that the answer may change. |
| **5. Report usefulness** | No real candidate has read a report. Everything is staff, synthetic answers and the stand-in. | Whether the feedback is specific, fair and worth paying for is a judgement candidates make. Product principle 1 puts it above every other measurement on this page, and it is the one with no metric. |

## What it is blocked on, in the order that blocks

1. **A signed reviewer agreement** (`docs/privacy/reviewer-agreement.md`, ADR-0017 decision 6) — it
   does not exist. Until it does, `CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS` stays false and only
   staff answers are offered for calibration. This blocks 1, 2 and 4.
2. **Candidates who consent to `transcript_review`** — opt-in, default off, refusable at no cost.
   Nothing may sample an answer except through `ConsentsService.usersGranting("transcript_review")`.
3. **A way for candidates to reach the product at all** — which is the pre-public list in
   `docs/status-and-dependencies.md` §7.3: a domain, Resend with a verified domain, Termii with an
   approved sender ID, R2, a hosting decision, a privacy policy and terms. A pilot with invited
   candidates needs most of it.
4. **Enough sessions for the pace report to mean something** — more than 40 follow-up answers, which
   is roughly ten sessions, not two.

## What the pilot must produce

- Answers in `evals/datasets/gold/`, scored by a person under the signed agreement, in the format the
  loader already reads. Enough of them to carry a fairness read **per criterion**, which is the axis
  that matters (`evals/README.md`).
- A re-read of `pnpm --filter @readi/api interviews:pace` with its sample size on its face, and a
  decision on `SECONDS_FOR_A_FOLLOW_UP` that is no longer provisional.
- The opus-against-sonnet comparison re-run against the gold set, priced and approved as usual
  (CLAUDE.md §7.8–7.9), with the cost difference stated next to the agreement difference.
- Candidates' own words about their reports — whatever form that takes. Unmetricated on purpose;
  product principle 1 is a judgement, not a threshold.

## What the pilot is not

- Not the place to add features. Everything on this page is a measurement against what M4 shipped.
- Not a launch: no payments (M8), no readiness score (M6), no study plan (M7).
- Not a reason to weaken a threshold. `thresholds.yaml` is enforced `on_provenance: human`
  specifically so that an empty gold set fails rather than passes.

## Until then

Every figure above is quoted with its caveat, everywhere it appears: `evals/README.md`, the phase 5
handover and the M4 milestone handover all carry it. Anything that repeats the fairness figure to
anyone — a handover, a pitch, an investor page — repeats it as "fair to model-written Nigerian
English", never as "fair".

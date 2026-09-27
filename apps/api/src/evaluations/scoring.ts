import {
  MAX_CRITERION_SCORE,
  PROMPTED_CRITERION_WEIGHT,
  SCORING_VERSION,
} from "@readi/shared-types";

/**
 * One answer's 0–100, in code (spec §6.2: "Overall = weighted average of criteria scaled to 0–100
 * (computed in code)").
 *
 * Nothing here asks a model anything. The evaluator produced a 0–4 per criterion and the words behind
 * it; this is the arithmetic on top, and it is separate for two reasons. The model must not be told
 * the weights — it would spend its judgement on the 45% criterion and skim the rest — and the `/evals`
 * agreement metric has to compare a human's per-criterion scores with the model's, never with our sum
 * (`answer_evaluations` keeps `criteria`, `overall_raw` and `overall` in three columns for exactly
 * that reason).
 *
 * ## Two numbers, and the difference between them is two product decisions
 *
 * `overallRaw` is the pinned weights applied to the model's scores, over the whole rubric. `overall`
 * is that after two adjustments, in this order.
 *
 * **1. A criterion nobody asked about leaves the sum entirely** (owner's decision, 2026-09-27; see
 * `notAssessedCriteria`). Not scored 0 — *absent*, from the numerator and from the denominator both.
 *
 * **2. The prompting adjustment**: of what is left, a criterion the engine had to ask about
 * contributes at `PROMPTED_CRITERION_WEIGHT` (0.85) of its weight whenever it scored anything at all.
 *
 * - **Any non-zero score, not a curve.** "You lose a little for needing the nudge" is something a
 *   candidate can check against their own transcript. A discount that scaled with the score is not.
 * - **The numerator only.** The denominator stays the assessed criteria's full weight, so the
 *   adjustment can only ever lower a score. If the discount came off both, a prompted criterion
 *   scoring well would *raise* the total — which is the sort of arithmetic that gets discovered by a
 *   candidate rather than by us.
 * - **A discount, not a zero.** A candidate who covers something after being asked has covered it.
 *   A 3 out of 4 on a criterion worth 40% of the answer loses about 4.5 points of it.
 *
 * The two are opposite ends of one idea, and the first paid run is what made the gap visible: the 0.85
 * protects a candidate who **needed** a nudge, and there was nothing at all for one who was never
 * **offered** one. So they are keyed on the same engine fact and they compose — a criterion may be
 * prompted, or unassessed, but never both, because being prompted means a probe was asked.
 *
 * `overallRaw` deliberately carries **neither**. It is the model's reading weighted by the pinned
 * rubric and nothing else, because `/evals` has to be able to say whether the model agrees with a
 * human without our fairness arithmetic in the middle of it (`answer_evaluations` keeps `criteria`,
 * `overall_raw` and `overall` in three columns for exactly that reason). Both numbers are stored under
 * `SCORING_VERSION`, so a report assembled under one rule is never silently compared with one
 * assembled under another.
 */

/** A criterion as the **pinned snapshot** has it. The weights never come from live content. */
export interface WeightedCriterion {
  position: number;
  weight: number;
}

/** One criterion as the evaluator scored it. `max_score` is not read: the ladder is 0–4 in code. */
export interface ScoredCriterion {
  criterion: number;
  score: number;
}

/**
 * A criterion as the evaluator **read** it — its score and the quotes behind it.
 *
 * `notAssessedCriteria` needs the quotes and `scoreAnswer` does not, which is why they are two
 * functions: the arithmetic should not be able to reach the evidence, and the decision that reads the
 * evidence should not be able to reach the weights.
 */
export interface ReadCriterion extends ScoredCriterion {
  evidence: readonly string[];
}

/** The two engine facts a score is keyed on, both from `prompting.ts` and never from a model. */
export interface EngineFacts {
  /** Criteria the engine asked a probe for — `promptedCriteria()`. */
  prompted: readonly number[];
  /** Criteria whose probes were all left unasked — `notAssessedCriteria()`. */
  notAssessed: readonly number[];
}

export interface AnswerScore {
  /**
   * 0–100 from the model's scores and the pinned weights, over the **whole** rubric. What `/evals`
   * compares, so neither fairness adjustment is in it.
   */
  overallRaw: number;
  /** 0–100 over the assessed criteria, after the prompting adjustment. What the candidate is shown. */
  overall: number;
  /** The criteria discounted, in rubric order — stored so a re-score can be checked. */
  promptedCriteria: number[];
  /** The criteria left out of `overall` altogether, in rubric order. Stored for the same reason. */
  notAssessedCriteria: number[];
  scoringVersion: number;
}

/**
 * Which criteria this answer is **not scored on** — the fairness fix of 2026-09-27.
 *
 * Two facts have to hold, and they come from two different places on purpose.
 *
 * - **Nobody asked.** `unasked` is the engine's own record (`unaskedCriteria()`): this criterion
 *   carries probes, and the interview asked none of them. Visible to the candidate in their own
 *   transcript, which is why the whole prompting rule is keyed on the engine and never on the coverage
 *   model's private verdict.
 * - **And the answer did not reach it anyway.** Taken from the evaluator's reading: a score of 0 with
 *   no evidence, which the contract already defines as "the criterion was never addressed at all"
 *   (spec §6.2). A candidate who volunteered it without being asked scores on it as normal — that is
 *   the skill the report is about. A candidate who addressed it squarely and was **wrong** also scores
 *   on it as normal, and is recognisable by the quote: the evaluator is told to quote the sentence
 *   where they were wrong, and a 0 *with* evidence is that case rather than this one.
 *
 * ## Never the whole rubric
 *
 * If every criterion would be excluded, none is. Two of the 104 seeded questions have a probe for
 * every criterion, so this is reachable rather than theoretical, and the case it is reachable in is an
 * answer that addressed nothing at all — which is a 0 the candidate earned on the thing the prompt did
 * ask. An answer that exists has a score; "we could not assess you on anything" is a claim about a
 * broken question, and it would leave the report with a null it cannot explain.
 */
export function notAssessedCriteria(
  criteria: readonly WeightedCriterion[],
  scores: readonly ReadCriterion[],
  unasked: readonly number[],
): number[] {
  const unaskedSet = new Set(unasked);
  const readAt = new Map(scores.map((score) => [score.criterion, score]));
  const excluded = criteria
    .filter((criterion) => {
      if (!unaskedSet.has(criterion.position)) return false;
      const read = readAt.get(criterion.position);
      // A criterion the model did not score at all is *not* excluded: the worker's first gate makes
      // that unreachable, and reading a missing score as "the answer said nothing" would hand a
      // broken evaluation a free pass over the rubric.
      return read !== undefined && read.score === 0 && read.evidence.length === 0;
    })
    .map((criterion) => criterion.position);
  return excluded.length === criteria.length ? [] : excluded;
}

/**
 * Scores one answer.
 *
 * `engine` carries the two facts from `prompting.ts`. A criterion in the rubric with no score
 * contributes 0 rather than being skipped — the worker's first gate makes that impossible, and
 * quietly dropping it would turn a broken evaluation into a flattering one. A score for a criterion
 * the pinned rubric does not have is ignored for the mirror-image reason: it cannot be weighted,
 * because nothing says what it is worth.
 */
export function scoreAnswer(
  criteria: readonly WeightedCriterion[],
  scores: readonly ScoredCriterion[],
  engine: EngineFacts,
): AnswerScore {
  const scoreAt = new Map(scores.map((score) => [score.criterion, score.score]));
  const promptedSet = new Set(engine.prompted);
  const notAssessedSet = new Set(engine.notAssessed);
  const assessed = criteria.filter((criterion) => !notAssessedSet.has(criterion.position));
  const rawTotal = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const assessedTotal = assessed.reduce((sum, criterion) => sum + criterion.weight, 0);
  const reported = {
    // Every criterion the engine probed, whether or not it earned a discount — the engine fact is
    // what happened in the interview, and a 0 that was probed is still a 0 that was probed.
    promptedCriteria: criteria
      .filter((criterion) => promptedSet.has(criterion.position))
      .map((criterion) => criterion.position),
    notAssessedCriteria: criteria
      .filter((criterion) => notAssessedSet.has(criterion.position))
      .map((criterion) => criterion.position),
    scoringVersion: SCORING_VERSION,
  };
  if (rawTotal <= 0 || assessedTotal <= 0) {
    // A rubric whose weights sum to nothing cannot produce a score. Content rules make it
    // unreachable (`check-bank.mjs`, the admin editor); 0 is the honest answer if one ever is.
    return { overallRaw: 0, overall: 0, ...reported };
  }

  let raw = 0;
  let adjusted = 0;
  for (const criterion of criteria) {
    const score = scoreAt.get(criterion.position) ?? 0;
    const share = (score / MAX_CRITERION_SCORE) * criterion.weight;
    // The raw number is over the whole rubric: it is what the model said, weighted, and nothing else.
    raw += share;
    if (notAssessedSet.has(criterion.position)) continue;
    // The discount applies to any non-zero score, and to the numerator only.
    const prompted = score > 0 && promptedSet.has(criterion.position);
    adjusted += prompted ? share * PROMPTED_CRITERION_WEIGHT : share;
  }

  return {
    overallRaw: percent(raw, rawTotal),
    overall: percent(adjusted, assessedTotal),
    ...reported,
  };
}

/** A weighted share as a whole percentage, rounded half up and clamped to 0–100. */
function percent(share: number, total: number): number {
  return Math.min(100, Math.max(0, Math.round((share / total) * 100)));
}

/**
 * The session's own 0–100: the mean of the answers that could be scored.
 *
 * **Per answer, not per criterion.** Weighting the session by criterion would let a question with
 * five criteria count more than one with three, which is a fact about how a rubric was written rather
 * than about the interview. Every question the candidate answered counts once.
 *
 * Unscored answers are left out rather than counted as 0: a model that would not produce valid output
 * is our failure, and charging the candidate for it would be indefensible. `scored_answers` and
 * `total_answers` are both on the report, so a candidate can see that one question is missing.
 * Null when nothing could be scored at all.
 */
export function sessionOverall(overalls: readonly number[]): number | null {
  if (overalls.length === 0) return null;
  return Math.round(overalls.reduce((sum, value) => sum + value, 0) / overalls.length);
}

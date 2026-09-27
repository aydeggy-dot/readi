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
 * ## Two numbers, and the difference between them is a product decision
 *
 * `overallRaw` is the pinned weights applied to the model's scores. `overall` is that after the
 * **prompting adjustment**: a criterion the engine had to ask about contributes at
 * `PROMPTED_CRITERION_WEIGHT` (0.85) of its weight whenever it scored anything at all.
 *
 * - **Any non-zero score, not a curve.** "You lose a little for needing the nudge" is something a
 *   candidate can check against their own transcript. A discount that scaled with the score is not.
 * - **The numerator only.** The denominator stays the rubric's full weight, so the adjustment can only
 *   ever lower a score. If the discount came off both, a prompted criterion scoring well would *raise*
 *   the total — which is the sort of arithmetic that gets discovered by a candidate rather than by us.
 * - **A discount, not a zero.** A candidate who covers something after being asked has covered it.
 *   A 3 out of 4 on a criterion worth 40% of the answer loses about 4.5 points of it.
 *
 * Both numbers are stored under `SCORING_VERSION`, so a report assembled under one rule is never
 * silently compared with one assembled under another.
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

export interface AnswerScore {
  /** 0–100 from the model's scores and the pinned weights. What `/evals` compares. */
  overallRaw: number;
  /** 0–100 after the prompting adjustment. What the candidate is shown. */
  overall: number;
  /** The criteria discounted, in rubric order — stored so a re-score can be checked. */
  promptedCriteria: number[];
  scoringVersion: number;
}

/**
 * Scores one answer.
 *
 * `prompted` is the engine fact from `promptedCriteria()`. A criterion in the rubric with no score
 * contributes 0 rather than being skipped — the worker's first gate makes that impossible, and
 * quietly dropping it would turn a broken evaluation into a flattering one. A score for a criterion
 * the pinned rubric does not have is ignored for the mirror-image reason: it cannot be weighted,
 * because nothing says what it is worth.
 */
export function scoreAnswer(
  criteria: readonly WeightedCriterion[],
  scores: readonly ScoredCriterion[],
  prompted: readonly number[],
): AnswerScore {
  const scoreAt = new Map(scores.map((score) => [score.criterion, score.score]));
  const promptedSet = new Set(prompted);
  const total = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (total <= 0) {
    // A rubric whose weights sum to nothing cannot produce a score. Content rules make it
    // unreachable (`check-bank.mjs`, the admin editor); 0 is the honest answer if one ever is.
    return {
      overallRaw: 0,
      overall: 0,
      promptedCriteria: [...promptedSet].sort(),
      scoringVersion: SCORING_VERSION,
    };
  }

  let raw = 0;
  let adjusted = 0;
  for (const criterion of criteria) {
    const score = scoreAt.get(criterion.position) ?? 0;
    const share = (score / MAX_CRITERION_SCORE) * criterion.weight;
    raw += share;
    // The discount applies to any non-zero score, and to the numerator only.
    const prompted = score > 0 && promptedSet.has(criterion.position);
    adjusted += prompted ? share * PROMPTED_CRITERION_WEIGHT : share;
  }

  return {
    overallRaw: percent(raw, total),
    overall: percent(adjusted, total),
    // Every criterion the engine probed, whether or not it earned a discount — the engine fact is
    // what happened in the interview, and a 0 that was probed is still a 0 that was probed.
    promptedCriteria: criteria
      .filter((criterion) => promptedSet.has(criterion.position))
      .map((criterion) => criterion.position),
    scoringVersion: SCORING_VERSION,
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

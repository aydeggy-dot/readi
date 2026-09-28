import type { CalibrationAgreement, CriterionScore } from "@readi/shared-types";

/**
 * How closely a person and the model read the same answers. Pure, so the dashboard is arithmetic
 * over stored rows rather than a query anybody has to trust.
 *
 * **This is the second implementation of one definition.** The first is `agreement()` in
 * `apps/ai-worker/readi_worker/evals/metrics.py`, which the `/evals` harness computes against the
 * written expectations. The five figures mean exactly what they mean there, in the same order, and
 * for the same stated reason — each hides what the others show: exact match is brutal on a five-rung
 * ladder, within-one flatters, MAE is blind to direction, and correlation is blind to a model that is
 * uniformly two rungs generous, which only `bias` sees. Two copies of a definition is the thing
 * CLAUDE.md warns about, so the cost is stated rather than discovered: a change here is a change
 * there, and a figure from this dashboard is only comparable with a harness figure while they agree.
 *
 * The direction of `bias` is fixed by that mirror too. In the harness the model is on the left and
 * the expectation on the right, so a positive bias is a generous model; here the person plays the
 * expectation's part and the sign keeps its meaning.
 */

/** One criterion, as both sides scored it. `model` and `person` are rungs on the same 0–4 ladder. */
export interface ScorePair {
  model: number;
  person: number;
}

export const EMPTY_AGREEMENT: CalibrationAgreement = {
  n: 0,
  exact: 0,
  within_one: 0,
  mae: 0,
  bias: 0,
  correlation: null,
};

export function agreement(pairs: readonly ScorePair[]): CalibrationAgreement {
  const n = pairs.length;
  if (n === 0) return EMPTY_AGREEMENT;
  let exact = 0;
  let within = 0;
  let absolute = 0;
  let signed = 0;
  for (const { model, person } of pairs) {
    if (model === person) exact += 1;
    if (Math.abs(model - person) <= 1) within += 1;
    absolute += Math.abs(model - person);
    signed += model - person;
  }
  return {
    n,
    exact: exact / n,
    within_one: within / n,
    mae: absolute / n,
    bias: signed / n,
    correlation: pearson(pairs),
  };
}

/** Null when either side does not vary: a correlation with a constant is undefined, not 0. */
function pearson(pairs: readonly ScorePair[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  const meanModel = pairs.reduce((sum, pair) => sum + pair.model, 0) / n;
  const meanPerson = pairs.reduce((sum, pair) => sum + pair.person, 0) / n;
  let covariance = 0;
  let varModel = 0;
  let varPerson = 0;
  for (const { model, person } of pairs) {
    const dm = model - meanModel;
    const dp = person - meanPerson;
    covariance += dm * dp;
    varModel += dm * dm;
    varPerson += dp * dp;
  }
  const denominator = Math.sqrt(varModel * varPerson);
  if (denominator === 0) return null;
  // Clamped because floating point can put a perfect correlation a hair outside [-1, 1], and the
  // contract's `.min(-1).max(1)` would then reject a figure that is simply 1.
  return Math.min(1, Math.max(-1, covariance / denominator));
}

/**
 * Pair up two readings of one answer **by criterion position**, never by array order.
 *
 * A reviewer's form submits its criteria in the rubric's order and the model's reading is stored in
 * the order it produced, and the two coincide right up until one of them does not. Pairing by
 * position is also what makes a criterion either side left out simply absent from the comparison
 * rather than silently compared with its neighbour.
 */
export function pairByCriterion(
  model: readonly Pick<CriterionScore, "criterion" | "score">[],
  person: readonly Pick<CriterionScore, "criterion" | "score">[],
): ScorePair[] {
  const byPosition = new Map(person.map((entry) => [entry.criterion, entry.score]));
  const pairs: ScorePair[] = [];
  for (const entry of model) {
    const theirs = byPosition.get(entry.criterion);
    if (theirs === undefined) continue;
    pairs.push({ model: entry.score, person: theirs });
  }
  return pairs;
}

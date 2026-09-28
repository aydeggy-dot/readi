import { describe, expect, it } from "vitest";
import { EMPTY_AGREEMENT, agreement, pairByCriterion } from "./calibration-agreement";

/**
 * The arithmetic behind the calibration dashboard, and the mirror of
 * `readi_worker/evals/metrics.py`'s `agreement()`. Every expectation here is a figure that function
 * produces on the same pairs — which is the only thing that keeps a dashboard percentage and a
 * harness percentage on one axis.
 */
describe("agreement", () => {
  it("is empty rather than zero-confident when nothing has been scored", () => {
    expect(agreement([])).toEqual(EMPTY_AGREEMENT);
    expect(agreement([]).correlation).toBeNull();
  });

  it("reports five figures because each hides what the others show", () => {
    // The pairs `test_evals_metrics.py` uses on the Python side, and its figures: exact 2/4,
    // within-one 3/4, MAE 0.75, bias +0.25. Same numbers in, same numbers out, or the dashboard and
    // the harness are not measuring one thing.
    const value = agreement([
      { model: 3, person: 3 },
      { model: 2, person: 3 },
      { model: 4, person: 2 },
      { model: 1, person: 1 },
    ]);
    expect(value.n).toBe(4);
    expect(value.exact).toBeCloseTo(0.5);
    expect(value.within_one).toBeCloseTo(0.75);
    expect(value.mae).toBeCloseTo(0.75);
    expect(value.bias).toBeCloseTo(0.25);
  });

  it("sees a uniformly generous model in the bias, where the correlation cannot", () => {
    const value = agreement([
      { model: 4, person: 2 },
      { model: 3, person: 1 },
      { model: 2, person: 0 },
    ]);
    expect(value.correlation).toBe(1);
    expect(value.bias).toBeCloseTo(2);
    expect(value.exact).toBe(0);
  });

  it("calls a correlation with a constant undefined rather than zero", () => {
    expect(
      agreement([
        { model: 3, person: 2 },
        { model: 3, person: 4 },
      ]).correlation,
    ).toBeNull();
    expect(agreement([{ model: 3, person: 3 }]).correlation).toBeNull();
  });

  it("keeps a perfect correlation inside the contract's range", () => {
    // Floating point can put this a hair above 1, which the contract would reject.
    const value = agreement([
      { model: 0, person: 0 },
      { model: 1, person: 1 },
      { model: 4, person: 4 },
    ]);
    expect(value.correlation).toBe(1);
    expect(value.exact).toBe(1);
    expect(value.bias).toBe(0);
  });

  it("reads bias as the model minus the person, as the harness does", () => {
    expect(agreement([{ model: 1, person: 3 }]).bias).toBeCloseTo(-2);
  });
});

describe("pairByCriterion", () => {
  const score = (criterion: number, value: number) => ({ criterion, score: value });

  it("pairs by position, not by array order", () => {
    const pairs = pairByCriterion(
      [score(0, 4), score(1, 2), score(2, 3)],
      [score(2, 3), score(0, 1), score(1, 2)],
    );
    expect(pairs).toEqual([
      { model: 4, person: 1 },
      { model: 2, person: 2 },
      { model: 3, person: 3 },
    ]);
  });

  it("leaves a criterion only one side scored out of the comparison entirely", () => {
    // Not compared with its neighbour, and not counted as a disagreement either.
    expect(pairByCriterion([score(0, 4), score(1, 2)], [score(0, 4)])).toEqual([
      { model: 4, person: 4 },
    ]);
    expect(pairByCriterion([score(0, 4)], [score(0, 4), score(1, 0)])).toHaveLength(1);
  });

  it("is empty when the two readings share no criterion", () => {
    expect(pairByCriterion([score(0, 4)], [score(7, 4)])).toEqual([]);
  });
});

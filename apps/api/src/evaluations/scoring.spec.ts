import { PROMPTED_CRITERION_WEIGHT, SCORING_VERSION } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { scoreAnswer, sessionOverall, type WeightedCriterion } from "./scoring";

/**
 * The arithmetic between a model's 0–4 and the number a candidate reads.
 *
 * It is unit-tested rather than left to the integration test for the reason spec §7 gives about the
 * readiness formula: a score is the product, and "the formula lives in code, is versioned, and is
 * unit-tested" is the rule (CLAUDE.md §5). Every number below is worked out in the assertion rather
 * than copied from a run, so a test that agrees with a bug is not possible.
 */
describe("scoreAnswer", () => {
  const criteria: WeightedCriterion[] = [
    { position: 0, weight: 60 },
    { position: 1, weight: 40 },
  ];

  it("weights the criteria and scales to 0–100", () => {
    // (3/4 × 60 + 2/4 × 40) / 100 = 0.65
    const score = scoreAnswer(
      criteria,
      [
        { criterion: 0, score: 3 },
        { criterion: 1, score: 2 },
      ],
      [],
    );
    expect(score.overallRaw).toBe(65);
    expect(score.overall).toBe(65);
    expect(score.promptedCriteria).toEqual([]);
    expect(score.scoringVersion).toBe(SCORING_VERSION);
  });

  it("scores 100 for full marks and 0 for none", () => {
    const full = [
      { criterion: 0, score: 4 },
      { criterion: 1, score: 4 },
    ];
    expect(scoreAnswer(criteria, full, []).overall).toBe(100);
    expect(
      scoreAnswer(
        criteria,
        full.map((entry) => ({ ...entry, score: 0 })),
        [],
      ).overall,
    ).toBe(0);
  });

  it("discounts a prompted criterion to 0.85 of its weight, and leaves the raw score alone", () => {
    const score = scoreAnswer(
      criteria,
      [
        { criterion: 0, score: 3 },
        { criterion: 1, score: 3 },
      ],
      [1],
    );
    // Raw: (0.75 × 60 + 0.75 × 40) / 100 = 75.
    expect(score.overallRaw).toBe(75);
    // Adjusted: criterion 1 only — (0.75 × 60 + 0.75 × 40 × 0.85) / 100 = 70.5 → 71.
    expect(score.overall).toBe(71);
    // The plan's own worked example: "a 3/4 on a 40% criterion loses about 4.5 points".
    expect(score.overallRaw - 0.75 * 40 * (1 - PROMPTED_CRITERION_WEIGHT)).toBeCloseTo(70.5);
    expect(score.promptedCriteria).toEqual([1]);
  });

  it("does not discount a prompted criterion that scored 0", () => {
    // There is nothing to take 15% off. It also matters that the criterion is still *reported* as
    // prompted: the engine asked about it, and that is true whatever the answer was worth.
    const score = scoreAnswer(
      criteria,
      [
        { criterion: 0, score: 4 },
        { criterion: 1, score: 0 },
      ],
      [1],
    );
    expect(score.overallRaw).toBe(60);
    expect(score.overall).toBe(60);
    expect(score.promptedCriteria).toEqual([1]);
  });

  it("never raises a score by discounting — the denominator is the full weight", () => {
    // The failure this guards against is taking the 15% off both sides, which would leave a prompted
    // criterion scoring *better* than an unprompted one and would be found by a candidate, not by us.
    const scores = [
      { criterion: 0, score: 4 },
      { criterion: 1, score: 4 },
    ];
    const unprompted = scoreAnswer(criteria, scores, []);
    const prompted = scoreAnswer(criteria, scores, [0, 1]);
    expect(prompted.overall).toBeLessThan(unprompted.overall);
    expect(prompted.overall).toBe(85);
  });

  it("handles a criterion carrying two probes as one criterion", () => {
    /*
     * The trap the owner named for this phase: a criterion may carry two probes, and code keyed by
     * criterion drops the second (`review-doc.ts` did). Here the consequence would be a *double*
     * discount — 0.85² — if the caller passed the same criterion twice. It passes a set, and this
     * pins that reading: needing two nudges on one criterion is still one criterion prompted.
     */
    const twice = scoreAnswer(criteria, [{ criterion: 1, score: 4 }], [1, 1]);
    const once = scoreAnswer(criteria, [{ criterion: 1, score: 4 }], [1]);
    expect(twice.overall).toBe(once.overall);
    expect(twice.promptedCriteria).toEqual([1]);
  });

  it("counts a criterion the model did not score as 0 rather than dropping it", () => {
    // Dropping it would renormalise over the criteria that were scored and turn a broken evaluation
    // into a flattering one. The worker's first gate makes this unreachable; the arithmetic is still
    // defined for it.
    expect(scoreAnswer(criteria, [{ criterion: 0, score: 4 }], []).overall).toBe(60);
  });

  it("ignores a score for a criterion the pinned rubric does not have", () => {
    // It cannot be weighted, because nothing says what it is worth.
    expect(
      scoreAnswer(
        criteria,
        [
          { criterion: 0, score: 4 },
          { criterion: 1, score: 4 },
          { criterion: 7, score: 4 },
        ],
        [],
      ).overall,
    ).toBe(100);
  });

  it("returns 0 for a rubric whose weights sum to nothing", () => {
    const score = scoreAnswer([{ position: 0, weight: 0 }], [{ criterion: 0, score: 4 }], []);
    expect(score.overall).toBe(0);
    expect(score.overallRaw).toBe(0);
  });

  it("weights unevenly rather than averaging", () => {
    // The whole point of weights: 4 on the 90% criterion and 0 on the 10% one is not 50.
    const uneven: WeightedCriterion[] = [
      { position: 0, weight: 90 },
      { position: 1, weight: 10 },
    ];
    expect(
      scoreAnswer(
        uneven,
        [
          { criterion: 0, score: 4 },
          { criterion: 1, score: 0 },
        ],
        [],
      ).overall,
    ).toBe(90);
  });

  it("does not care whether the weights sum to 100", () => {
    // Nothing in the content rules says they must, so the roll-up normalises by their own total.
    const thirds: WeightedCriterion[] = [
      { position: 0, weight: 1 },
      { position: 1, weight: 1 },
    ];
    expect(
      scoreAnswer(
        thirds,
        [
          { criterion: 0, score: 4 },
          { criterion: 1, score: 2 },
        ],
        [],
      ).overall,
    ).toBe(75);
  });
});

describe("sessionOverall", () => {
  it("is the mean of the answers that were scored, per answer", () => {
    expect(sessionOverall([80, 60, 40])).toBe(60);
  });

  it("rounds to a whole number", () => {
    expect(sessionOverall([80, 61])).toBe(71);
  });

  it("is null when nothing could be scored", () => {
    // Not 0. A model that would not produce output is our failure, and charging it to the candidate
    // would be indefensible.
    expect(sessionOverall([])).toBeNull();
  });
});

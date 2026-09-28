import { PROMPTED_CRITERION_WEIGHT, SCORING_VERSION } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import {
  notAssessedCriteria,
  type ReadCriterion,
  scoreAnswer,
  sessionOverall,
  type WeightedCriterion,
} from "./scoring";

/**
 * The arithmetic between a model's 0–4 and the number a candidate reads.
 *
 * It is unit-tested rather than left to the integration test for the reason spec §7 gives about the
 * readiness formula: a score is the product, and "the formula lives in code, is versioned, and is
 * unit-tested" is the rule (CLAUDE.md §5). Every number below is worked out in the assertion rather
 * than copied from a run, so a test that agrees with a bug is not possible.
 */

/** An interview that asked about everything: neither adjustment applies. */
const NOTHING = { prompted: [], notAssessed: [] } as const;

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
      { prompted: [], notAssessed: [] },
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
    expect(scoreAnswer(criteria, full, NOTHING).overall).toBe(100);
    expect(
      scoreAnswer(
        criteria,
        full.map((entry) => ({ ...entry, score: 0 })),
        NOTHING,
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
      { prompted: [1], notAssessed: [] },
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
      { prompted: [1], notAssessed: [] },
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
    const unprompted = scoreAnswer(criteria, scores, NOTHING);
    const prompted = scoreAnswer(criteria, scores, { prompted: [0, 1], notAssessed: [] });
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
    const twice = scoreAnswer(criteria, [{ criterion: 1, score: 4 }], {
      prompted: [1, 1],
      notAssessed: [],
    });
    const once = scoreAnswer(criteria, [{ criterion: 1, score: 4 }], {
      prompted: [1],
      notAssessed: [],
    });
    expect(twice.overall).toBe(once.overall);
    expect(twice.promptedCriteria).toEqual([1]);
  });

  it("counts a criterion the model did not score as 0 rather than dropping it", () => {
    // Dropping it would renormalise over the criteria that were scored and turn a broken evaluation
    // into a flattering one. The worker's first gate makes this unreachable; the arithmetic is still
    // defined for it.
    expect(scoreAnswer(criteria, [{ criterion: 0, score: 4 }], NOTHING).overall).toBe(60);
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
        NOTHING,
      ).overall,
    ).toBe(100);
  });

  it("returns 0 for a rubric whose weights sum to nothing", () => {
    const score = scoreAnswer([{ position: 0, weight: 0 }], [{ criterion: 0, score: 4 }], NOTHING);
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
        NOTHING,
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
        NOTHING,
      ).overall,
    ).toBe(75);
  });

  it("leaves a not-assessed criterion out of the denominator, not at 0", () => {
    // 4 on the 60% criterion and the 40% one excluded: 60/60 = 100, not 60/100 = 60. The whole fix is
    // in the denominator — excluding it from the numerator alone would change nothing at all.
    const score = scoreAnswer(criteria, [{ criterion: 0, score: 4 }], {
      prompted: [],
      notAssessed: [1],
    });
    expect(score.overall).toBe(100);
    expect(score.notAssessedCriteria).toEqual([1]);
  });

  it("keeps the raw score over the whole rubric, so /evals still compares like with like", () => {
    // `overall_raw` is the model's reading weighted, and nothing else. A harness comparing humans to
    // it must not be reading our fairness arithmetic back out of the number.
    const score = scoreAnswer(criteria, [{ criterion: 0, score: 4 }], {
      prompted: [],
      notAssessed: [1],
    });
    expect(score.overallRaw).toBe(60);
    expect(score.overall).toBe(100);
  });

  it("composes with the prompting discount over what is left", () => {
    // Criterion 1 out; criterion 0 prompted and scoring 3. (0.75 × 60 × 0.85) / 60 = 63.75 → 64.
    expect(
      scoreAnswer(criteria, [{ criterion: 0, score: 3 }], {
        prompted: [0],
        notAssessed: [1],
      }).overall,
    ).toBe(64);
  });
});

/**
 * **The fairness fix of 2026-09-27, and the case the owner asked it to be tested on.**
 *
 * The first paid evaluation run scored question 4 (`db-half-finished-transfer`) 55 out of 100 because
 * criterion 2 — 35% of the rubric, "Deals with the rows that are already wrong" — scored 0 with no
 * quotes. Its probe existed, was in play, and was **never asked**: the engine opened the question with
 * 127 seconds left, the answer took 99, and at submission 25 seconds remained against a 45-second
 * follow-up reserve. Three correct rules composed into a candidate losing 35 points to the clock with
 * neither the report nor their own transcript able to say why
 * (`docs/progress/2026-09-27-m4-first-paid-evaluation.md` §1).
 *
 * The numbers below are that run's, from its `answer_evaluations` row and its `session_turns`.
 */
describe("the first paid run's question 4", () => {
  const rubric: WeightedCriterion[] = [
    { position: 0, weight: 25 }, // Sees the gap between the two writes
    { position: 1, weight: 40 }, // Puts a boundary in the right place
    { position: 2, weight: 35 }, // Deals with the rows that are already wrong
  ];
  const read: ReadCriterion[] = [
    { criterion: 0, score: 4, evidence: ["two", "quotes"] },
    { criterion: 1, score: 3, evidence: ["three", "quotes", "here"] },
    // 0 with nothing to quote: spec §6.2's "the criterion was never addressed at all".
    { criterion: 2, score: 0, evidence: [] },
  ];
  // Criteria 1 and 2 carried probes; no follow-up was asked on this question at all, so both were
  // unasked. Criterion 0 is the one the opening prompt asks, and carries no probe.
  const unasked = [1, 2];

  it("is no longer marked down for the criterion nothing asked about", () => {
    const notAssessed = notAssessedCriteria(rubric, read, unasked);
    // Criterion 1 was unasked too, but the candidate covered it anyway and scored 3 — that is the
    // skill, and it is scored as normal. Only criterion 2 leaves the sum.
    expect(notAssessed).toEqual([2]);

    const score = scoreAnswer(rubric, read, { prompted: [], notAssessed });
    // (1.00 × 25 + 0.75 × 40) / 65 = 84.6 → 85, against the 55 the candidate was shown.
    expect(score.overall).toBe(85);
    // And what the run actually produced, still stored untouched for the harness.
    expect(score.overallRaw).toBe(55);
  });

  it("was 55 under the old rule, which is the number this exists to stop happening again", () => {
    // The whole difference between 55 and 85 is one criterion whose probe existed and was never asked.
    expect(scoreAnswer(rubric, read, NOTHING).overall).toBe(55);
  });
});

describe("notAssessedCriteria", () => {
  const criteria: WeightedCriterion[] = [
    { position: 0, weight: 50 },
    { position: 1, weight: 50 },
  ];

  it("needs both facts: nobody asked, and the answer did not reach it", () => {
    const unreached: ReadCriterion[] = [{ criterion: 1, score: 0, evidence: [] }];
    expect(notAssessedCriteria(criteria, unreached, [1])).toEqual([1]);
    // Asked about, so it is scored however it went — this is the ordinary prompted case.
    expect(notAssessedCriteria(criteria, unreached, [])).toEqual([]);
  });

  it("scores a criterion the candidate volunteered without being asked", () => {
    // Volunteering the point is the skill the report is about, so it counts — and it counts at full
    // weight, because no probe was asked and the prompting discount has nothing to apply to.
    const volunteered: ReadCriterion[] = [{ criterion: 1, score: 3, evidence: ["I also..."] }];
    expect(notAssessedCriteria(criteria, volunteered, [1])).toEqual([]);
  });

  it("scores a criterion the candidate addressed and got wrong", () => {
    /*
     * The case that makes the evidence test load-bearing rather than decorative. A 0 *with* a quote is
     * "they addressed it squarely and were wrong" — the evaluator is told to quote the sentence where
     * they were wrong, and the rubric descriptors were rewritten in September 2026 for exactly that
     * answer. Excluding it would delete the most useful mark in the report.
     */
    const wrong: ReadCriterion[] = [
      { criterion: 1, score: 0, evidence: ["I would just retry it"] },
    ];
    expect(notAssessedCriteria(criteria, wrong, [1])).toEqual([]);
  });

  it("does not exclude a criterion the model failed to score at all", () => {
    // A missing entry is a broken evaluation, not an answer that said nothing. Reading it as the
    // latter would hand the whole rubric a free pass — the worker's first gate makes it unreachable.
    expect(notAssessedCriteria(criteria, [], [1])).toEqual([]);
  });

  it("never excludes the whole rubric", () => {
    /*
     * Two of the 104 seeded questions probe every criterion, so this is reachable — and the answer it
     * is reachable with is one that addressed nothing at all, which is a 0 the candidate earned on the
     * thing the prompt did ask. An answer that exists gets a number; "we could not assess you on
     * anything" is a claim about a broken question and would leave the report with a null it cannot
     * explain.
     */
    const nothing: ReadCriterion[] = [
      { criterion: 0, score: 0, evidence: [] },
      { criterion: 1, score: 0, evidence: [] },
    ];
    expect(notAssessedCriteria(criteria, nothing, [0, 1])).toEqual([]);
    expect(scoreAnswer(criteria, nothing, { prompted: [], notAssessed: [] }).overall).toBe(0);
  });

  it("reports in rubric order", () => {
    const three: WeightedCriterion[] = [...criteria, { position: 2, weight: 10 }];
    const read: ReadCriterion[] = [
      { criterion: 0, score: 3, evidence: ["said it"] },
      { criterion: 1, score: 0, evidence: [] },
      { criterion: 2, score: 0, evidence: [] },
    ];
    expect(notAssessedCriteria(three, read, [2, 1])).toEqual([1, 2]);
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

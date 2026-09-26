import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVALUATION_LIMITS, MAX_CRITERION_SCORE } from "../constants.js";
import {
  AnswerEvaluation,
  CandidateCriterionFeedback,
  CriterionScore,
  EvaluateAnswerRequest,
  evidenceRuleViolations,
} from "./evaluations.js";

interface EvidenceCase {
  name: string;
  criteria: { criterion: number; score: number; evidence: string[] }[];
  expected: number[];
}

const cases: EvidenceCase[] = (
  JSON.parse(readFileSync(join(import.meta.dirname, "..", "evidence-cases.json"), "utf8")) as {
    cases: EvidenceCase[];
  }
).cases;

describe("the evidence rule (spec §6.2)", () => {
  it("has cases to run, so an empty file cannot pass quietly", () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
    // At least one case must expect a violation and one must expect none, or the rule is only ever
    // tested in the direction that happens to pass.
    expect(cases.some((c) => c.expected.length > 0)).toBe(true);
    expect(cases.some((c) => c.expected.length === 0)).toBe(true);
  });

  it.each(cases)("$name", ({ criteria, expected }) => {
    const evaluation = {
      // Annotated rather than asserted: an object literal would widen `max_score` to `number`.
      criteria: criteria.map((c): CriterionScore => ({
        ...c,
        max_score: MAX_CRITERION_SCORE,
        reasoning: "why.",
      })),
    };
    expect(evidenceRuleViolations(evaluation).map((v) => v.criterion)).toEqual(expected);
  });

  it("names the criterion in the message, so a retry can say what to fix", () => {
    const criterion: CriterionScore = {
      criterion: 2,
      score: 3,
      max_score: MAX_CRITERION_SCORE,
      evidence: [],
      reasoning: "x.",
    };
    const [violation] = evidenceRuleViolations({ criteria: [criterion] });
    expect(violation?.message).toContain("criterion 2");
    expect(violation?.message).toContain("3");
  });
});

describe("what the evaluator may be sent", () => {
  const criterion = {
    position: 0,
    dimension: "Looks at what actually ran",
    description: "Inspects the queries rather than reasoning from the code alone.",
    levels: {
      "0": "Guesses.",
      "1": "Looks elsewhere.",
      "2": "Logs.",
      "3": "Counts.",
      "4": "Reads a plan.",
    },
  };
  const request = {
    session_id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    position: 0,
    question: {
      slug: "n-plus-one-diagnosis",
      type: "technical" as const,
      topic: {
        id: "33333333-3333-4333-8333-333333333333",
        slug: "databases",
        name: "Databases",
        description: "Schema design, queries and what they cost.",
      },
      prompt: "An endpoint takes three seconds in production. What do you do?",
      context: null,
      ideal_points: ["Counts the queries one request makes."],
      rubric: {
        slug: "query-performance-diagnosis",
        name: "Diagnosing a slow query path",
        criteria: [criterion, { ...criterion, position: 1 }],
      },
    },
    exchange: [
      {
        kind: "text" as const,
        seq: 0,
        speaker: "interviewer" as const,
        follow_up_index: null,
        text: "Here it is.",
      },
      {
        kind: "text" as const,
        seq: 1,
        speaker: "candidate" as const,
        follow_up_index: null,
        text: "I'd count the queries.",
      },
    ],
  };

  it("accepts the shape the API builds", () => {
    expect(() => EvaluateAnswerRequest.parse(request)).not.toThrow();
  });

  it("carries no criterion weight — how much each is worth is arithmetic, and ours", () => {
    const weighted = {
      ...request,
      question: {
        ...request.question,
        rubric: {
          ...request.question.rubric,
          criteria: [
            { ...criterion, weight: 40 },
            { ...criterion, position: 1 },
          ],
        },
      },
    };
    const parsed = EvaluateAnswerRequest.parse(weighted);
    expect(parsed.question.rubric.criteria[0]).not.toHaveProperty("weight");
  });

  it("carries no planned follow-ups — the probes that were asked are already in the exchange", () => {
    const parsed = EvaluateAnswerRequest.parse({
      ...request,
      question: { ...request.question, planned_follow_ups: [{ criterion: 1, probe: "And why?" }] },
    });
    expect(parsed.question).not.toHaveProperty("planned_follow_ups");
  });
});

describe("what a candidate may read", () => {
  it("has no room for a criterion's description, its ladder, its weight or its position", () => {
    const parsed = CandidateCriterionFeedback.parse({
      dimension: "Recognises the pattern",
      score: 3,
      max_score: MAX_CRITERION_SCORE,
      evidence: ["twenty-one queries, not one"],
      reasoning: "Named the N+1 and why it costs what it does.",
      // Everything below is answer key and must not survive a parse.
      description: "Names the N+1.",
      levels: { "0": "No diagnosis." },
      weight: 35,
      position: 1,
      criterion: 1,
    });
    for (const key of ["description", "levels", "weight", "position", "criterion"]) {
      expect(parsed).not.toHaveProperty(key);
    }
  });
});

describe("the stored evaluation", () => {
  it("refuses a score off the rubric's ladder", () => {
    const score = { criterion: 0, max_score: MAX_CRITERION_SCORE, evidence: [], reasoning: "x." };
    expect(() => CriterionScore.parse({ ...score, score: MAX_CRITERION_SCORE + 1 })).toThrow();
    expect(() => CriterionScore.parse({ ...score, score: -1 })).toThrow();
  });

  it("refuses more quotes per criterion than a reader would check", () => {
    expect(() =>
      CriterionScore.parse({
        criterion: 0,
        score: 3,
        max_score: MAX_CRITERION_SCORE,
        evidence: Array.from({ length: EVALUATION_LIMITS.evidencePerCriterion + 1 }, () => "said"),
        reasoning: "x.",
      }),
    ).toThrow();
  });

  it("requires a tip, because an evaluation with no next step is a grade", () => {
    const evaluation = {
      criteria: [
        {
          criterion: 0,
          score: 3,
          max_score: MAX_CRITERION_SCORE,
          evidence: ["a"],
          reasoning: "b.",
        },
        {
          criterion: 1,
          score: 2,
          max_score: MAX_CRITERION_SCORE,
          evidence: ["c"],
          reasoning: "d.",
        },
      ],
      covered_points: [],
      missing_points: [],
      strengths: [],
      red_flags: [],
      confidence: "medium" as const,
    };
    expect(() =>
      AnswerEvaluation.parse({ ...evaluation, improvement_tip: "Count first." }),
    ).not.toThrow();
    expect(() => AnswerEvaluation.parse({ ...evaluation, improvement_tip: "" })).toThrow();
    expect(() => AnswerEvaluation.parse(evaluation)).toThrow();
  });
});

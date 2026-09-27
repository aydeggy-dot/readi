import { type AnswerEvaluation, SessionReportResponse } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { type AnswerForReport, assembleReport } from "./report-assembly";
import { scoreAnswer } from "./scoring";

/**
 * The report, assembled from per-answer JSON in code.
 *
 * Every case here is about a decision rather than about plumbing: what aggregates (topic and type, not
 * "dimension"), how the three strengths and three fixes are chosen, what an unscored answer looks
 * like, and — the one that matters most — that nothing from the answer key reaches the candidate shape
 * except the pinned ideal points. The assembled object is parsed through `SessionReportResponse` in
 * every case, so a shape the contract would refuse cannot pass here either.
 */
const ANSWER_KEY = "ANSWERKEY-must-never-appear";

const TOPIC_IDS: Record<string, string> = {
  databases: "6f2c1d84-9b3e-4c7a-8f5d-0e1a2b3c4d5e",
  testing: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
};

function topic(slug: string) {
  return {
    id: TOPIC_IDS[slug] ?? "11111111-2222-4333-8444-555555555555",
    slug,
    name: `Topic ${slug}`,
    description: null,
  };
}

function evaluation(overrides: Partial<AnswerEvaluation> = {}): AnswerEvaluation {
  return {
    criteria: [
      {
        criterion: 0,
        score: 3,
        max_score: 4,
        evidence: ["I counted the queries"],
        reasoning: "Did.",
      },
      {
        criterion: 1,
        score: 2,
        max_score: 4,
        evidence: ["I added an index"],
        reasoning: "Partly.",
      },
    ],
    covered_points: ["Counted the queries"],
    missing_points: ["Did not say what it costs elsewhere"],
    strengths: ["Went and looked"],
    improvement_tip: "Say what the fix costs elsewhere.",
    red_flags: [],
    confidence: "high",
    ...overrides,
  };
}

function answer(overrides: Partial<AnswerForReport> = {}): AnswerForReport {
  const base: AnswerForReport = {
    position: 0,
    type: "technical",
    topic: topic("databases"),
    prompt: "An endpoint takes three seconds. What do you do?",
    idealPoints: ["Counts the queries one request makes."],
    criteria: [
      { position: 0, dimension: "Looks at what actually ran" },
      { position: 1, dimension: "Recognises the pattern" },
    ],
    followUpsAsked: 0,
    promptedCriteria: [],
    notAssessedCriteria: [],
    evaluation: evaluation(),
    score: null,
  };
  const merged = { ...base, ...overrides };
  return {
    ...merged,
    score:
      overrides.score !== undefined
        ? overrides.score
        : merged.evaluation
          ? scoreAnswer(
              [
                { position: 0, weight: 60 },
                { position: 1, weight: 40 },
              ],
              merged.evaluation.criteria,
              {
                prompted: merged.promptedCriteria,
                notAssessed: merged.notAssessedCriteria,
              },
            )
          : null,
  };
}

const CATALOGUE = {
  role: { slug: "backend", name: "Backend engineer" },
  level: { slug: "mid", name: "Mid-level" },
  stack: null,
};

const assemble = (answers: AnswerForReport[]) =>
  SessionReportResponse.parse(
    assembleReport({
      sessionId: "3b7d2a91-4c5e-4a2b-8e6f-1d9c0a5b3e77",
      catalogue: CATALOGUE,
      answers,
      lessons: [],
      endedAt: new Date("2026-09-27T09:58:00.000Z"),
      generatedAt: new Date("2026-09-27T10:00:00.000Z"),
    }),
  );

describe("assembleReport", () => {
  it("is ready when every answer was scored, and averages them per answer", () => {
    const report = assemble([
      answer({ position: 0 }),
      answer({
        position: 1,
        evaluation: evaluation({
          criteria: [
            { criterion: 0, score: 4, max_score: 4, evidence: ["a"], reasoning: "Yes." },
            { criterion: 1, score: 4, max_score: 4, evidence: ["b"], reasoning: "Yes." },
          ],
        }),
      }),
    ]);
    expect(report.status).toBe("ready");
    expect(report.scored_answers).toBe(2);
    expect(report.total_answers).toBe(2);
    // 65 and 100, per answer rather than per criterion.
    expect(report.overall).toBe(83);
  });

  it("is partial when one answer could not be scored, and says so on that question", () => {
    const report = assemble([
      answer({ position: 0 }),
      answer({ position: 1, evaluation: null, score: null }),
    ]);
    expect(report.status).toBe("partial");
    expect(report.scored_answers).toBe(1);
    expect(report.total_answers).toBe(2);
    // The one number the candidate reads is the mean of what could be scored, not of what was asked.
    expect(report.overall).toBe(65);
    const unscored = report.questions[1];
    expect(unscored?.overall).toBeNull();
    expect(unscored?.criteria).toEqual([]);
    expect(unscored?.improvement_tip).toBeNull();
    // And it still tells them what a strong answer covers, which is the useful half of a lost score.
    expect(unscored?.strong_answer_covers).toEqual(["Counts the queries one request makes."]);
  });

  it("is failed, with a null overall, when nothing could be scored", () => {
    const report = assemble([answer({ evaluation: null, score: null })]);
    expect(report.status).toBe("failed");
    expect(report.overall).toBeNull();
    expect(report.strengths).toEqual([]);
    expect(report.fixes).toEqual([]);
  });

  it("takes strengths from the best answers and fixes from the worst", () => {
    const weak = evaluation({
      criteria: [
        { criterion: 0, score: 0, max_score: 4, evidence: [], reasoning: "No." },
        { criterion: 1, score: 0, max_score: 4, evidence: [], reasoning: "No." },
      ],
      strengths: ["STRENGTH from the weak answer"],
      improvement_tip: "FIX from the weak answer",
    });
    const strong = evaluation({
      criteria: [
        { criterion: 0, score: 4, max_score: 4, evidence: ["a"], reasoning: "Yes." },
        { criterion: 1, score: 4, max_score: 4, evidence: ["b"], reasoning: "Yes." },
      ],
      strengths: ["STRENGTH from the strong answer"],
      improvement_tip: "FIX from the strong answer",
    });
    const report = assemble([
      answer({ position: 0, evaluation: weak }),
      answer({ position: 1, evaluation: strong }),
    ]);
    // ...and each one says which answer it is about, so the summary is checkable against the
    // breakdown rather than three claims floating above six questions.
    expect(report.strengths[0]).toEqual({
      text: "STRENGTH from the strong answer",
      question_position: 1,
    });
    expect(report.fixes[0]).toEqual({ text: "FIX from the weak answer", question_position: 0 });
  });

  it("caps the highlights at three and does not repeat one", () => {
    const many = (strengths: string[]) => evaluation({ strengths });
    const report = assemble([
      answer({ position: 0, evaluation: many(["one", "two", "  ONE  ", "three", "four"]) }),
    ]);
    expect(report.strengths.map((highlight) => highlight.text)).toEqual(["one", "two", "three"]);
  });

  it("attributes a repeated tip to the answer where following it gains the most", () => {
    const same = "Say what you measured.";
    const weak = evaluation({
      criteria: [
        { criterion: 0, score: 0, max_score: 4, evidence: [], reasoning: "No." },
        { criterion: 1, score: 0, max_score: 4, evidence: [], reasoning: "No." },
      ],
      improvement_tip: same,
    });
    const report = assemble([
      answer({ position: 0, evaluation: evaluation({ improvement_tip: same }) }),
      answer({ position: 1, evaluation: weak }),
    ]);
    // One piece of advice, and it points at question 1 — the worse answer, which is the one the list
    // is ordered by and the one where acting on it is worth the most.
    expect(report.fixes).toEqual([{ text: same, question_position: 1 }]);
  });

  it("carries the catalogue the session pinned, not the live rows", () => {
    const report = assemble([answer({})]);
    expect(report.role).toEqual(CATALOGUE.role);
    expect(report.level).toEqual(CATALOGUE.level);
    expect(report.stack).toBeNull();
    // The date a candidate means by "that interview" is when it ended, not when we got round to it.
    expect(report.ended_at).toBe("2026-09-27T09:58:00.000Z");
  });

  it("aggregates by topic and by question type, weakest first", () => {
    const zero = evaluation({
      criteria: [
        { criterion: 0, score: 0, max_score: 4, evidence: [], reasoning: "No." },
        { criterion: 1, score: 0, max_score: 4, evidence: [], reasoning: "No." },
      ],
    });
    const report = assemble([
      answer({ position: 0, topic: topic("databases"), type: "technical" }),
      answer({ position: 1, topic: topic("testing"), type: "behavioral", evaluation: zero }),
    ]);
    expect(report.by_topic.map((row) => [row.topic.slug, row.overall, row.answers])).toEqual([
      ["testing", 0, 1],
      ["databases", 65, 1],
    ]);
    expect(report.by_type.map((row) => [row.type, row.overall])).toEqual([
      ["behavioral", 0],
      ["technical", 65],
    ]);
  });

  it("leaves an unscored answer out of the aggregates rather than counting it as 0", () => {
    const report = assemble([
      answer({ position: 0, topic: topic("databases") }),
      answer({ position: 1, topic: topic("testing"), evaluation: null, score: null }),
    ]);
    expect(report.by_topic.map((row) => row.topic.slug)).toEqual(["databases"]);
    expect(report.by_topic[0]?.answers).toBe(1);
  });

  it("says how much was volunteered, from the engine fact", () => {
    const report = assemble([answer({ promptedCriteria: [1], followUpsAsked: 1 })]);
    expect(report.questions[0]?.prompting).toEqual({
      criteria_total: 2,
      criteria_volunteered: 1,
      follow_ups_asked: 1,
    });
    expect(report.questions[0]?.not_assessed).toEqual([]);
  });

  it("names a not-assessed criterion instead of scoring it, and marks the answer out of the rest", () => {
    /*
     * The report half of the 2026-09-27 fairness fix. A criterion nobody asked about is in
     * `not_assessed` by its dimension and **not** in `criteria`, so the page cannot show it at 0 of 4 —
     * which is what the first paid run's fourth answer did, for 35% of a rubric.
     *
     * Note what the numbers become: the answer is marked out of the 60% criterion alone, and the
     * prompting sentence's denominator drops with it, because "you covered 1 of 2 before I asked" is a
     * claim about an interview that did not happen.
     */
    const report = assemble([
      answer({
        notAssessedCriteria: [1],
        evaluation: evaluation({
          criteria: [
            {
              criterion: 0,
              score: 3,
              max_score: 4,
              evidence: ["I counted the queries"],
              reasoning: "Did.",
            },
            { criterion: 1, score: 0, max_score: 4, evidence: [], reasoning: "Never came up." },
          ],
        }),
      }),
    ]);
    const question = report.questions[0];
    expect(question?.not_assessed).toEqual(["Recognises the pattern"]);
    expect(question?.criteria.map((criterion) => criterion.dimension)).toEqual([
      "Looks at what actually ran",
    ]);
    // 0.75 × 60 / 60 = 75, not 0.75 × 60 / 100 = 45.
    expect(question?.overall).toBe(75);
    expect(question?.prompting).toEqual({
      criteria_total: 1,
      criteria_volunteered: 1,
      follow_ups_asked: 0,
    });
  });

  it("names nothing for an answer that could not be scored at all", () => {
    // Nothing is known about which criteria the answer reached, and "nobody asked" is only half the
    // rule. The unscored panel is the honest state there, not a list of points we did not get to.
    const report = assemble([answer({ evaluation: null, score: null })]);
    expect(report.questions[0]?.not_assessed).toEqual([]);
  });

  it("never reports a negative volunteered count", () => {
    // A snapshot and a transcript that disagree must not put "-1 of 2" on a candidate's screen.
    const report = assemble([answer({ promptedCriteria: [0, 1, 2, 3] })]);
    expect(report.questions[0]?.prompting.criteria_volunteered).toBe(0);
  });

  it("joins each criterion's score to its pinned dimension and nothing else", () => {
    const report = assemble([answer()]);
    expect(report.questions[0]?.criteria).toEqual([
      {
        dimension: "Looks at what actually ran",
        score: 3,
        max_score: 4,
        evidence: ["I counted the queries"],
        reasoning: "Did.",
      },
      {
        dimension: "Recognises the pattern",
        score: 2,
        max_score: 4,
        evidence: ["I added an index"],
        reasoning: "Partly.",
      },
    ]);
  });

  it("drops a criterion the model did not score rather than showing it at 0", () => {
    // Inventing a 0 would be putting words in the rubric's mouth. `scoreAnswer` still counts it as 0
    // in the arithmetic, which is the honest place for it.
    const report = assemble([
      answer({
        evaluation: evaluation({
          criteria: [{ criterion: 0, score: 4, max_score: 4, evidence: ["a"], reasoning: "Yes." }],
        }),
      }),
    ]);
    expect(report.questions[0]?.criteria.map((row) => row.dimension)).toEqual([
      "Looks at what actually ran",
    ]);
    expect(report.questions[0]?.overall).toBe(60);
  });

  it("carries no criterion description, weight or level descriptor — only the dimension", () => {
    /*
     * The mirror of `content-no-answer-key.int.spec.ts`, at the level of the assembler: the input here
     * carries the answer key in the fields the report is built from, and the assembled JSON must not.
     * `CandidateCriterionFeedback` has no field for any of it, so this is really a test that nobody has
     * widened the shape — which is exactly the failure worth catching, because widening it would
     * compile.
     */
    const report = assemble([
      answer({
        criteria: [
          { position: 0, dimension: "Looks at what actually ran" },
          { position: 1, dimension: "Recognises the pattern" },
        ],
        // The one part of the answer key that IS allowed out, once the session has been scored.
        idealPoints: ["Counts the queries one request makes."],
      }),
    ]);
    // Field by field rather than by substring: the topic legitimately carries a `description`, so a
    // grep for the word would be a test that passes for the wrong reason. These five keys are the
    // whole of `CandidateCriterionFeedback`, and a sixth is what this is watching for.
    expect(Object.keys(report.questions[0]?.criteria[0] ?? {}).sort()).toEqual([
      "dimension",
      "evidence",
      "max_score",
      "reasoning",
      "score",
    ]);
    const json = JSON.stringify(report);
    expect(json).not.toContain(ANSWER_KEY);
    expect(json).not.toContain("weight");
    expect(json).not.toContain('"levels"');
    // And the one part of the answer key that IS allowed out, so this is not passing on an empty page.
    expect(json).toContain("Counts the queries one request makes.");
  });
});

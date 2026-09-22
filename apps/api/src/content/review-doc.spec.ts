import { SeedFile, type SeedQuestion, type SeedRubric } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { buildReviewDoc } from "./review-doc";
import type { LoadedSeedFile } from "./seed-loader";

/*
 * The review pages are the only thing most content experts read (CLAUDE.md §7.7), so what a
 * question's heading names is a contract with them: REVIEW.md asks them to confirm the roles and
 * the stacks on each question, and they cannot answer a question the page does not show them.
 */

const rubric: SeedRubric = {
  slug: "a-rubric",
  name: "A rubric",
  criteria: [
    {
      dimension: "technical",
      description: "Whether they can.",
      weight: 60,
      levels: { "0": "absent", "1": "weak", "2": "partial", "3": "solid", "4": "excellent" },
    },
    {
      dimension: "communication",
      description: "Whether they can say so.",
      weight: 40,
      levels: { "0": "absent", "1": "weak", "2": "partial", "3": "solid", "4": "excellent" },
    },
  ],
};

const question = (over: Partial<SeedQuestion> = {}): SeedQuestion => ({
  slug: "a-question",
  roles: ["frontend"],
  levels: ["mid"],
  stacks: [],
  type: "technical",
  topic: "a-topic",
  subtopic: null,
  difficulty: 3,
  prompt: "How?",
  context: null,
  rubric: "a-rubric",
  ideal_points: ["Somehow."],
  reviewer_notes: "Nothing to flag.",
  ...over,
});

// Parsed rather than cast: the fixture is then the shape the loader would really have produced,
// and a contract change breaks this file instead of hiding behind a double assertion.
const files = (questions: readonly SeedQuestion[]): LoadedSeedFile[] => [
  {
    file: "content/seed/frontend/questions.yaml",
    data: SeedFile.parse({
      version: 1,
      author: "ai_draft",
      status: "draft",
      questions: [...questions],
      rubrics: [rubric],
    }),
  },
];

const build = (questions: readonly SeedQuestion[]) =>
  buildReviewDoc("frontend", files(questions), { generatedBy: "a test" }).markdown;

describe("buildReviewDoc", () => {
  it("names every role a question is for, so a reviewer can say whether they are right", () => {
    expect(build([question({ roles: ["frontend", "fullstack"] })])).toContain(
      "roles: frontend, fullstack",
    );
  });

  it("names the stacks only when the question is narrowed to some", () => {
    expect(build([question({ stacks: ["react-typescript", "react-node"] })])).toContain(
      "stacks: react-typescript, react-node",
    );
    expect(build([question()])).not.toContain("stacks:");
  });
});

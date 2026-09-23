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
  planned_follow_ups: [],
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

  /*
   * Planned follow-ups print under the criterion they probe, because the question a reviewer is
   * asked — does this probe draw out *that* criterion — cannot be answered without the criterion
   * beside it. **Both** of a criterion's probes print: this page keyed them by criterion until
   * 2026-09-23, when a criterion was allowed two, and it silently showed only the second.
   */
  describe("planned follow-ups", () => {
    const probed = (planned: { criterion: number; probe: string }[]) =>
      build([question({ planned_follow_ups: planned })]);

    it("prints each probe under the criterion it probes", () => {
      const page = probed([{ criterion: 1, probe: "And how would you say so?" }]);
      expect(page).toContain("> And how would you say so?");
      // The criterion with no probe says why it has none, rather than saying nothing.
      expect(page).toContain("_Asked for by the opening prompt; no planned follow-up._");
    });

    it("prints both probes when a criterion carries two", () => {
      const page = probed([
        { criterion: 1, probe: "The first thing I would ask?" },
        { criterion: 1, probe: "And the second?" },
      ]);
      expect(page).toContain("> The first thing I would ask?");
      expect(page).toContain("> And the second?");
      expect(page).toContain("the second only if the first did not draw it out");
    });
  });
});

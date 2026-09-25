import { join, resolve } from "node:path";
import { SeedFile, type SeedQuestion, type SeedRubric } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { buildReviewDoc } from "./review-doc";
import { loadSeedDirectory, type LoadedSeedFile } from "./seed-loader";

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
const file = (path: string, questions: readonly SeedQuestion[]): LoadedSeedFile => ({
  file: path,
  data: SeedFile.parse({
    version: 1,
    author: "ai_draft",
    status: "draft",
    questions: [...questions],
    rubrics: [rubric],
  }),
});

/** `roles.yaml` in miniature: the page's title and the bank names come off these rows (ADR-0015). */
const roles: LoadedSeedFile = {
  file: "content/seed/roles.yaml",
  data: SeedFile.parse({
    version: 1,
    author: "ai_draft",
    status: "draft",
    career_roles: [
      {
        slug: "frontend",
        name: "Frontend engineer",
        summary: "Builds what the user sees.",
        position: 0,
        supported_question_types: ["technical"],
        levels: ["mid"],
        stacks: [],
      },
      {
        slug: "fullstack",
        name: "Full-stack engineer",
        summary: "Holds both ends.",
        position: 1,
        supported_question_types: ["technical"],
        levels: ["mid"],
        stacks: [],
      },
    ],
  }),
};

const files = (questions: readonly SeedQuestion[]): LoadedSeedFile[] => [
  file("content/seed/frontend/questions.yaml", questions),
];

const build = (questions: readonly SeedQuestion[]) =>
  buildReviewDoc("frontend", files(questions), { generatedBy: "a test" }).markdown;

describe("buildReviewDoc", () => {
  /*
   * The page is the questions the role is offered, not the questions in its directory (owner's
   * decision, 2026-09-25). Selecting by path shrank every page by whatever another bank happened
   * to own: a QA reviewer signed off 35 questions while QA candidates were offered 45.
   */
  describe("which questions belong on a role's page", () => {
    const shared = question({ slug: "shared-one", roles: ["frontend", "qa"] });
    const frontendOnly = question({ slug: "frontend-one", roles: ["frontend"] });
    const corpus = [
      file("content/seed/frontend/questions.yaml", [frontendOnly, shared]),
      file("content/seed/qa/questions.yaml", [question({ slug: "qa-one", roles: ["qa"] })]),
    ];
    const corpusWithFullstack = [
      roles,
      file("content/seed/frontend/questions.yaml", [
        question({ slug: "borrowed-one", roles: ["frontend", "fullstack"] }),
      ]),
    ];
    const page = (role: string) => buildReviewDoc(role, corpus, { generatedBy: "a test" }).markdown;

    it("includes a question another bank owns when this role is asked it", () => {
      expect(page("qa")).toContain("shared-one");
    });

    it("leaves out a question this role is not asked", () => {
      expect(page("qa")).not.toContain("frontend-one");
    });

    it("says where a shared question lives, so the reviewer edits the right file", () => {
      expect(page("qa")).toContain("shared, from `content/seed/frontend/questions.yaml`");
      // Its own bank's questions are where the page already said they would be.
      expect(page("frontend")).not.toContain("shared, from");
    });

    it("puts the role's own questions first and counts both groups", () => {
      const qa = page("qa");
      expect(qa).toContain("**2 questions** (1 written for this role, 1 shared with other roles)");
      expect(qa.indexOf("qa-one")).toBeLessThan(qa.indexOf("shared-one"));
    });

    /*
     * A role with no bank of its own is asked a different question (owner's decision, 2026-09-25).
     * `fullstack` is offered 62 questions it did not write, every one of them already being read
     * question by question on the page of the role it was written for, so asking this reviewer for
     * the same review again is asking for the one thing they are worst placed to give. The page
     * asks what is missing between the halves instead.
     */
    it("asks a borrowed bank's reviewer about the set, not about each question", () => {
      const borrowed = buildReviewDoc("fullstack", corpusWithFullstack, {
        generatedBy: "a test",
      }).markdown;
      expect(borrowed).toContain("**This role has no bank of its own");
      expect(borrowed).toContain("**What is missing between them?**");
      expect(borrowed).toContain("you do not need to tick them");
      // Named from `roles.yaml`, not from the directory, and only the banks that fed this page.
      expect(borrowed).toContain("written for Frontend engineer");
      expect(borrowed).not.toContain("For each question, five questions");
    });
  });

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

/*
 * The corpus, not a fixture: the defect this guards against is not a bug in the renderer but a
 * mismatch between two sources of truth — which directory a question was written in, and which
 * roles it carries. Only the real files can show it, and the number that matters is the one a
 * reviewer signs off against the number a candidate is offered.
 */
describe("every question a role is offered is on that role's page", () => {
  const root = resolve(__dirname, "../../../..");
  const { files: corpus, problems } = loadSeedDirectory(join(root, "content/seed"), root);
  const roles = corpus.flatMap(({ data }) => data.career_roles ?? []).map((role) => role.slug);

  it("loads the seed corpus", () => {
    expect(problems).toEqual([]);
    expect(roles.length).toBeGreaterThan(0);
  });

  it.each(roles)("%s", (role) => {
    const offered = corpus
      .flatMap(({ data }) => data.questions ?? [])
      .filter((question) => question.roles.includes(role));
    const page = buildReviewDoc(role, corpus, { generatedBy: "a test" }).markdown;
    const missing = offered.filter((question) => !page.includes(`. ${question.slug}\n`));
    expect(missing.map((question) => question.slug)).toEqual([]);
    expect(page).toContain(`**${offered.length} questions**`);
  });
});

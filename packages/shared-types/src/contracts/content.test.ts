import { describe, expect, it } from "vitest";
import { CONTENT_LIMITS, RUBRIC_WEIGHT_TOTAL } from "../constants.js";
import {
  CandidateLessonResponse,
  CandidateLessonSummary,
  CandidateModule,
  CandidatePracticeItem,
  CandidateTrackResponse,
  ContentTransitionRequest,
  Question,
  QuestionInput,
  RubricInput,
  TopicInput,
  TrackInput,
  weightsTotalCorrectly,
} from "./content.js";

const TOPIC_ID = "3f3b0f6a-1d1e-4a52-9b0e-6f1a2c3d4e5f";
const RUBRIC_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const criterion = (weight: number) => ({
  dimension: "Problem framing",
  description: "Restates the problem and names the constraint that matters.",
  weight,
  levels: { "0": "Not addressed", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
});

const questionInput = () => ({
  slug: "react-profiler-slow-page",
  roles: ["frontend" as const],
  levels: ["mid" as const],
  stacks: [] as string[],
  type: "technical" as const,
  topic_id: TOPIC_ID,
  subtopic: null,
  difficulty: 3,
  prompt: "A product page is slow on older Android phones. What would you do?",
  context: null,
  rubric_id: RUBRIC_ID,
  ideal_points: ["Measures before changing anything"],
});

describe("slugs", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(
      TopicInput.parse({ slug: "state-management", name: "State", description: null }).slug,
    ).toBe("state-management");
  });

  it.each(["State-Management", "state_management", "-leading", "trailing-", "double--hyphen", ""])(
    "rejects %s",
    (value) => {
      expect(TopicInput.safeParse({ slug: value, name: "State", description: null }).success).toBe(
        false,
      );
    },
  );
});

describe("rubrics", () => {
  it("accepts criteria whose weights add up to 100", () => {
    const result = RubricInput.safeParse({
      slug: "performance-reasoning",
      name: "Performance reasoning",
      criteria: [criterion(60), criterion(40)],
    });
    expect(result.success).toBe(true);
  });

  it("rejects weights that add up to anything else, pointing at the criteria", () => {
    const result = RubricInput.safeParse({
      slug: "performance-reasoning",
      name: "Performance reasoning",
      criteria: [criterion(60), criterion(30)],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["criteria"]);
  });

  it("rejects a rubric with fewer criteria than the house minimum", () => {
    const result = RubricInput.safeParse({
      slug: "thin",
      name: "Thin",
      criteria: [criterion(RUBRIC_WEIGHT_TOTAL)],
    });
    expect(result.success).toBe(false);
  });

  it("exports the weight rule for the API's publish guard to reuse", () => {
    expect(weightsTotalCorrectly([{ weight: 50 }, { weight: 50 }])).toBe(true);
    expect(weightsTotalCorrectly([{ weight: 50 }, { weight: 49 }])).toBe(false);
    expect(weightsTotalCorrectly([])).toBe(false);
  });

  it("requires a descriptor for every level from 0 to 4", () => {
    const { levels, ...rest } = criterion(RUBRIC_WEIGHT_TOTAL);
    const missingFour = { ...rest, levels: { ...levels, "4": "" } };
    expect(
      RubricInput.safeParse({ slug: "r", name: "R", criteria: [missingFour, criterion(0)] })
        .success,
    ).toBe(false);
  });
});

describe("questions", () => {
  it("accepts a well-formed question", () => {
    expect(QuestionInput.safeParse(questionInput()).success).toBe(true);
  });

  it("requires at least one role, one level and one ideal point", () => {
    for (const patch of [{ roles: [] }, { levels: [] }, { ideal_points: [] }]) {
      expect(QuestionInput.safeParse({ ...questionInput(), ...patch }).success).toBe(false);
    }
  });

  /*
   * Stacks are the one list that may be empty, and that is not laxity — it is the rule. No tags
   * means general to the role, which is what most questions are; the narrowing is what has to be
   * chosen deliberately (ADR-0015).
   */
  it("takes no stacks, which is how a question stays general to its role", () => {
    expect(QuestionInput.safeParse({ ...questionInput(), stacks: [] }).success).toBe(true);
    expect(QuestionInput.safeParse({ ...questionInput(), stacks: ["java-spring"] }).success).toBe(
      true,
    );
    expect(QuestionInput.safeParse({ ...questionInput(), stacks: ["Java Spring"] }).success).toBe(
      false,
    );
  });

  it("keeps difficulty inside 1–5", () => {
    for (const difficulty of [0, 6, 2.5]) {
      expect(QuestionInput.safeParse({ ...questionInput(), difficulty }).success).toBe(false);
    }
  });

  it("caps the answer key so a question cannot become a lesson", () => {
    const ideal_points = Array.from({ length: CONTENT_LIMITS.idealPoints + 1 }, (_, i) => `p${i}`);
    expect(QuestionInput.safeParse({ ...questionInput(), ideal_points }).success).toBe(false);
  });
});

describe("candidate shapes carry no answer key", () => {
  // The guarantee is enforced end to end by the API's leak test; here we prove the schemas
  // themselves have no room for it, so a stray field cannot be parsed into one.
  // Every candidate shape, including the nested ones: the check reads `schema.shape` and does
  // not recurse, so a shape left out of this list is a shape nothing here inspects. Adding
  // `rubric` to `CandidateModule` used to leave every assertion in this file green.
  const shapes = {
    CandidateTrackResponse,
    CandidateLessonResponse,
    CandidatePracticeItem,
    CandidateModule,
    CandidateLessonSummary,
  };

  // `levels` (plural) is a rubric's level descriptors; `level` alone is the candidate's
  // experience level, which these shapes legitimately carry. The API's leak test uses the same
  // distinction, backed by sentinel strings that catch a leak whatever the field is called.
  it.each(Object.entries(shapes))("%s has no rubric or answer-key field", (_name, schema) => {
    const keys = Object.keys(schema.shape);
    expect(keys.some((key) => /rubric|criteri|ideal_point|levels|weight/i.test(key))).toBe(false);
  });

  it("strips unknown fields rather than passing them through", () => {
    const parsed = CandidatePracticeItem.parse({
      ...{
        id: TOPIC_ID,
        slug: "react-profiler-slow-page",
        type: "technical",
        difficulty: 3,
        prompt: "A product page is slow on older Android phones. What would you do?",
        context: null,
        topic: { id: TOPIC_ID, slug: "performance", name: "Performance", description: null },
      },
      ideal_points: ["leaked"],
      rubric: { criteria: [criterion(100)] },
    });
    expect(JSON.stringify(parsed)).not.toContain("leaked");
    expect(JSON.stringify(parsed)).not.toContain("Problem framing");
  });
});

describe("tracks and transitions", () => {
  it("accepts a track with core and non-core topics", () => {
    const result = TrackInput.safeParse({
      slug: "frontend-mid",
      role: "frontend",
      level: "mid",
      title: "Frontend, mid-level",
      summary: null,
      topics: [{ topic_id: TOPIC_ID, is_core: true }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts the four moves and nothing else", () => {
    for (const transition of ["submit", "publish", "retire", "return_to_draft"]) {
      expect(ContentTransitionRequest.safeParse({ transition, note: null }).success).toBe(true);
    }
    expect(ContentTransitionRequest.safeParse({ transition: "delete", note: null }).success).toBe(
      false,
    );
  });

  it("describes a stored question with its topic, rubric and embedding model", () => {
    const parsed = Question.safeParse({
      ...questionInput(),
      id: RUBRIC_ID,
      status: "published",
      version: 2,
      topic: { id: TOPIC_ID, slug: "performance", name: "Performance", description: null },
      rubric: {
        id: RUBRIC_ID,
        slug: "performance-reasoning",
        name: "Performance reasoning",
        status: "published",
        version: 1,
        criteria: [{ id: TOPIC_ID, ...criterion(RUBRIC_WEIGHT_TOTAL) }],
        seed_managed: false,
        ai_draft_unreviewed: false,
        reviewed_at: null,
        updated_at: "2026-09-21T10:00:00.000Z",
      },
      embedding_model: "fake-1",
      // Written in the CMS, so `/content/seed` no longer overwrites it (ADR-0014 decision 5),
      // and a person wrote it, so there is nothing for an expert to vouch for (decision 6).
      seed_managed: false,
      ai_draft_unreviewed: false,
      reviewed_at: null,
      updated_at: "2026-09-21T10:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });
});

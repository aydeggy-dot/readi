import { z } from "zod";
import { CATALOGUE_LIMITS, CONTENT_LIMITS, DIFFICULTY_RANGE, SLUG_PATTERN } from "../constants.js";
import { QuestionType, RubricCriterionInput, weightsTotalCorrectly } from "./content.js";
import { ExperienceLevel, TargetRole } from "./profiles.js";

/**
 * The seed file format: the YAML under `/content/seed` that `pnpm db:seed` imports (spec §4.2).
 *
 * Two things make it a separate contract rather than the API's own shapes:
 *
 * - **Seed files refer to each other by slug**, not by uuid. A file written by hand cannot know
 *   the ids a database will hand out, and a slug is also what a reviewer recognises.
 * - **They carry review metadata the database does not store** — `author` and `reviewer_notes` —
 *   because this content is drafted by a model and has to be checked by a human expert before it
 *   is worth anything (CLAUDE.md §7.7). The importer validates it, `content:review-doc` prints it,
 *   and it stays in the file.
 */

const slug = () =>
  z
    .string()
    .min(1)
    .max(CONTENT_LIMITS.slugMaxLength)
    .regex(new RegExp(SLUG_PATTERN), "lowercase words joined by single hyphens");

const title = () => z.string().trim().min(1).max(CONTENT_LIMITS.titleMaxLength);
const summary = () => z.string().trim().min(1).max(CONTENT_LIMITS.summaryMaxLength).nullable();

/**
 * Who wrote this. `ai_draft` means exactly what it says: drafted by a model, not yet reviewed by a
 * person who could be held to it. Nothing published to candidates should still say `ai_draft`.
 */
export const SeedAuthor = z.enum(["ai_draft", "human"]).meta({ id: "SeedAuthor" });
export type SeedAuthor = z.infer<typeof SeedAuthor>;

export const SeedTopic = z
  .object({ slug: slug(), name: title(), description: summary() })
  .meta({ id: "SeedTopic" });
export type SeedTopic = z.infer<typeof SeedTopic>;

// -----------------------------------------------------------------------------------------------
// The catalogue (ADR-0015). Roles, levels and stacks are content now, so they are seeded like
// content: by slug, as drafts, for the CMS to publish.

export const SeedCareerLevel = z
  .object({
    slug: slug(),
    name: title(),
    summary: summary(),
    /** Lowest first, sparse by convention (10, 20, 30…) so a level fits between two others. */
    rank: z.int().min(0).max(CATALOGUE_LIMITS.levelRankMax),
  })
  .meta({ id: "SeedCareerLevel" });
export type SeedCareerLevel = z.infer<typeof SeedCareerLevel>;

export const SeedStack = z
  .object({ slug: slug(), name: title(), summary: summary() })
  .meta({ id: "SeedStack" });
export type SeedStack = z.infer<typeof SeedStack>;

export const SeedCareerRole = z
  .object({
    slug: slug(),
    name: title(),
    summary: summary(),
    position: z.int().min(0).max(999),
    supported_question_types: z.array(QuestionType).min(1),
    /** Level slugs, from `levels.yaml`, in the order a candidate should see them. */
    levels: z.array(slug()).max(CATALOGUE_LIMITS.roleLevels),
    /** Stack slugs, from `stacks.yaml`; `default` is what the onboarding picker starts on. */
    stacks: z
      .array(z.object({ stack: slug(), default: z.boolean() }))
      .max(CATALOGUE_LIMITS.roleStacks),
  })
  .meta({ id: "SeedCareerRole" });
export type SeedCareerRole = z.infer<typeof SeedCareerRole>;

export const SeedRubric = z
  .object({
    slug: slug(),
    name: title(),
    criteria: z
      .array(RubricCriterionInput)
      .min(CONTENT_LIMITS.rubricCriteria.min)
      .max(CONTENT_LIMITS.rubricCriteria.max),
  })
  .refine((rubric) => weightsTotalCorrectly(rubric.criteria), {
    message: `criterion weights must add up to 100`,
    path: ["criteria"],
  })
  .meta({ id: "SeedRubric" });
export type SeedRubric = z.infer<typeof SeedRubric>;

export const SeedQuestion = z
  .object({
    slug: slug(),
    roles: z.array(TargetRole).min(1).max(3),
    levels: z.array(ExperienceLevel).min(1).max(2),
    type: QuestionType,
    /** A topic's slug, from `topics.yaml`. */
    topic: slug(),
    subtopic: z.string().trim().min(1).max(CONTENT_LIMITS.subtopicMaxLength).nullable(),
    difficulty: z.int().min(DIFFICULTY_RANGE.min).max(DIFFICULTY_RANGE.max),
    prompt: z.string().trim().min(1).max(CONTENT_LIMITS.questionPromptMaxLength),
    context: z.string().trim().min(1).max(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    /** A rubric's slug, from the same role's `rubrics.yaml`. */
    rubric: slug(),
    ideal_points: z
      .array(z.string().trim().min(1).max(CONTENT_LIMITS.idealPointMaxLength))
      .min(1)
      .max(CONTENT_LIMITS.idealPoints),
    /**
     * What the drafter is unsure about, addressed to the reviewing expert: a claim that may have
     * aged, a level that may be wrong, a rubric weight that was a judgement call. Required, and
     * "nothing" is a legitimate answer — an empty field usually means nobody looked.
     */
    reviewer_notes: z.string().trim().min(1).max(CONTENT_LIMITS.reviewerNotesMaxLength),
  })
  .meta({ id: "SeedQuestion" });
export type SeedQuestion = z.infer<typeof SeedQuestion>;

export const SeedLesson = z
  .object({
    slug: slug(),
    title: title(),
    topic: slug().nullable(),
    estimated_minutes: z.int().min(1).max(CONTENT_LIMITS.lessonMinutesMax).nullable(),
    /** Markdown. */
    body: z.string().trim().min(1).max(CONTENT_LIMITS.lessonBodyMaxLength),
  })
  .meta({ id: "SeedLesson" });
export type SeedLesson = z.infer<typeof SeedLesson>;

export const SeedModule = z
  .object({
    slug: slug(),
    title: title(),
    summary: summary(),
    lessons: z.array(SeedLesson).max(20),
  })
  .meta({ id: "SeedModule" });
export type SeedModule = z.infer<typeof SeedModule>;

export const SeedTrack = z
  .object({
    slug: slug(),
    role: TargetRole,
    level: ExperienceLevel,
    title: title(),
    summary: summary(),
    /** Topic slugs this track covers; `core` ones drive readiness coverage (spec §7). */
    topics: z.array(z.object({ topic: slug(), core: z.boolean() })).max(40),
    modules: z.array(SeedModule).max(20),
  })
  .meta({ id: "SeedTrack" });
export type SeedTrack = z.infer<typeof SeedTrack>;

/**
 * One seed file. Every file declares who wrote it and what state it imports as — and `draft` is
 * the only state a file may ask for. Publishing is a human decision taken in the CMS by someone
 * with the authority to make it, never a line in a file that an importer could act on.
 */
export const SeedFile = z.object({
  version: z.literal(1),
  author: SeedAuthor,
  status: z.literal("draft"),
  career_levels: z.array(SeedCareerLevel).max(20).optional(),
  stacks: z.array(SeedStack).max(100).optional(),
  career_roles: z.array(SeedCareerRole).max(50).optional(),
  topics: z.array(SeedTopic).max(100).optional(),
  rubrics: z.array(SeedRubric).max(100).optional(),
  questions: z.array(SeedQuestion).max(200).optional(),
  track: SeedTrack.optional(),
});
export type SeedFile = z.infer<typeof SeedFile>;

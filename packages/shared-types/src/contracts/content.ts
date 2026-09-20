import { z } from "zod";
import {
  CONTENT_ENTITY_TYPES,
  CONTENT_FLAG_REASONS,
  CONTENT_FLAG_STATUSES,
  CONTENT_LIMITS,
  CONTENT_STATUSES,
  DIFFICULTY_RANGE,
  QUESTION_TYPES,
  RUBRIC_WEIGHT_TOTAL,
  SLUG_PATTERN,
} from "../constants.js";
import { ExperienceLevel, TargetRole } from "./profiles.js";

/**
 * Learning content: tracks, modules, lessons, topics, questions and rubrics (spec §4.2, §4.8,
 * §6.1; ADR-0014).
 *
 * ## The rule that shapes this file
 *
 * **Candidate-facing schemas never carry the answer key.** Rubrics, criteria, level descriptors
 * and `ideal_points` tell a candidate exactly what a strong answer contains, so the `Candidate*`
 * schemas below are separate, smaller shapes rather than the admin ones with fields omitted — an
 * omission is one careless `.extend()` away from leaking. `content-no-answer-key.int.spec.ts`
 * enforces it against the raw JSON of every candidate endpoint.
 */

const slug = () =>
  z
    .string()
    .min(1)
    .max(CONTENT_LIMITS.slugMaxLength)
    .regex(new RegExp(SLUG_PATTERN), "lowercase words joined by single hyphens");

const title = () => z.string().trim().min(1).max(CONTENT_LIMITS.titleMaxLength);
const summary = () => z.string().trim().min(1).max(CONTENT_LIMITS.summaryMaxLength).nullable();

export const ContentStatus = z.enum(CONTENT_STATUSES).meta({ id: "ContentStatus" });
export type ContentStatus = z.infer<typeof ContentStatus>;

export const QuestionType = z.enum(QUESTION_TYPES).meta({ id: "QuestionType" });
export type QuestionType = z.infer<typeof QuestionType>;

export const ContentEntityType = z.enum(CONTENT_ENTITY_TYPES).meta({ id: "ContentEntityType" });
export type ContentEntityType = z.infer<typeof ContentEntityType>;

export const ContentFlagReason = z.enum(CONTENT_FLAG_REASONS).meta({ id: "ContentFlagReason" });
export type ContentFlagReason = z.infer<typeof ContentFlagReason>;

export const ContentFlagStatus = z.enum(CONTENT_FLAG_STATUSES).meta({ id: "ContentFlagStatus" });
export type ContentFlagStatus = z.infer<typeof ContentFlagStatus>;

/** Who may move content between states, and to where (the guard lives in the API). */
export const ContentTransition = z
  .enum(["submit", "publish", "retire", "return_to_draft"])
  .meta({ id: "ContentTransition" });
export type ContentTransition = z.infer<typeof ContentTransition>;

// -----------------------------------------------------------------------------------------------
// Topics: the curated taxonomy every question and lesson hangs from (spec §4.2).

export const TopicInput = z
  .object({
    slug: slug(),
    name: title(),
    description: summary(),
  })
  .meta({ id: "TopicInput" });
export type TopicInput = z.infer<typeof TopicInput>;

export const Topic = TopicInput.extend({ id: z.uuid() }).meta({ id: "Topic" });
export type Topic = z.infer<typeof Topic>;

// -----------------------------------------------------------------------------------------------
// Admin shapes. Everything a content expert or admin sees, including the answer key.

/** One criterion of a rubric, with a descriptor for each of the five levels (spec §6.1). */
export const RubricCriterionInput = z
  .object({
    /** What is being judged, e.g. "Problem framing". */
    dimension: z.string().trim().min(1).max(CONTENT_LIMITS.dimensionMaxLength),
    description: z.string().trim().min(1).max(CONTENT_LIMITS.criterionDescriptionMaxLength),
    /** Share of the rubric's score; the criteria of a rubric must add up to 100. */
    weight: z.int().min(1).max(RUBRIC_WEIGHT_TOTAL),
    levels: z
      .object({
        "0": z.string().trim().min(1).max(CONTENT_LIMITS.levelDescriptorMaxLength),
        "1": z.string().trim().min(1).max(CONTENT_LIMITS.levelDescriptorMaxLength),
        "2": z.string().trim().min(1).max(CONTENT_LIMITS.levelDescriptorMaxLength),
        "3": z.string().trim().min(1).max(CONTENT_LIMITS.levelDescriptorMaxLength),
        "4": z.string().trim().min(1).max(CONTENT_LIMITS.levelDescriptorMaxLength),
      })
      .meta({ id: "RubricLevels" }),
  })
  .meta({ id: "RubricCriterionInput" });
export type RubricCriterionInput = z.infer<typeof RubricCriterionInput>;

export const RubricCriterion = RubricCriterionInput.extend({ id: z.uuid() }).meta({
  id: "RubricCriterion",
});
export type RubricCriterion = z.infer<typeof RubricCriterion>;

/** Weights must total 100 exactly: a rubric that scores out of anything else is a bug, not a style. */
export const weightsTotalCorrectly = (criteria: readonly { weight: number }[]): boolean =>
  criteria.reduce((total, criterion) => total + criterion.weight, 0) === RUBRIC_WEIGHT_TOTAL;

export const RubricInput = z
  .object({
    slug: slug(),
    name: title(),
    criteria: z
      .array(RubricCriterionInput)
      .min(CONTENT_LIMITS.rubricCriteria.min)
      .max(CONTENT_LIMITS.rubricCriteria.max),
  })
  .refine((rubric) => weightsTotalCorrectly(rubric.criteria), {
    message: `criterion weights must add up to ${RUBRIC_WEIGHT_TOTAL}`,
    path: ["criteria"],
  })
  .meta({ id: "RubricInput" });
export type RubricInput = z.infer<typeof RubricInput>;

export const Rubric = z
  .object({
    id: z.uuid(),
    slug: slug(),
    name: title(),
    status: ContentStatus,
    version: z.int().min(1),
    criteria: z.array(RubricCriterion),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "Rubric" });
export type Rubric = z.infer<typeof Rubric>;

export const QuestionInput = z
  .object({
    slug: slug(),
    /** Which roles this question suits; a question may serve more than one (spec §6.1). */
    roles: z.array(TargetRole).min(1).max(3),
    levels: z.array(ExperienceLevel).min(1).max(2),
    type: QuestionType,
    topic_id: z.uuid(),
    subtopic: z.string().trim().min(1).max(CONTENT_LIMITS.subtopicMaxLength).nullable(),
    difficulty: z.int().min(DIFFICULTY_RANGE.min).max(DIFFICULTY_RANGE.max),
    /** What the interviewer asks. Markdown. */
    prompt: z.string().trim().min(1).max(CONTENT_LIMITS.questionPromptMaxLength),
    /** Optional setup the candidate is given before the question (markdown). */
    context: z.string().trim().min(1).max(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    rubric_id: z.uuid(),
    /** ANSWER KEY — what a strong answer covers. Never sent to a candidate. */
    ideal_points: z
      .array(z.string().trim().min(1).max(CONTENT_LIMITS.idealPointMaxLength))
      .min(1)
      .max(CONTENT_LIMITS.idealPoints),
  })
  .meta({ id: "QuestionInput" });
export type QuestionInput = z.infer<typeof QuestionInput>;

export const Question = QuestionInput.extend({
  id: z.uuid(),
  status: ContentStatus,
  version: z.int().min(1),
  topic: Topic,
  rubric: Rubric,
  /** Which model produced the stored embedding, so stale vectors can be found (ADR-0006). */
  embedding_model: z.string().min(1).max(60).nullable(),
  updated_at: z.iso.datetime(),
}).meta({ id: "Question" });
export type Question = z.infer<typeof Question>;

export const LessonInput = z
  .object({
    slug: slug(),
    title: title(),
    /** The lesson itself, in markdown. */
    body: z.string().trim().min(1).max(CONTENT_LIMITS.lessonBodyMaxLength),
    topic_id: z.uuid().nullable(),
    position: z.int().min(0).max(999),
    estimated_minutes: z.int().min(1).max(CONTENT_LIMITS.lessonMinutesMax).nullable(),
  })
  .meta({ id: "LessonInput" });
export type LessonInput = z.infer<typeof LessonInput>;

export const Lesson = LessonInput.extend({
  id: z.uuid(),
  module_id: z.uuid(),
  status: ContentStatus,
  version: z.int().min(1),
  updated_at: z.iso.datetime(),
}).meta({ id: "Lesson" });
export type Lesson = z.infer<typeof Lesson>;

export const ModuleInput = z
  .object({
    slug: slug(),
    title: title(),
    summary: summary(),
    position: z.int().min(0).max(999),
  })
  .meta({ id: "ModuleInput" });
export type ModuleInput = z.infer<typeof ModuleInput>;

export const Module = ModuleInput.extend({
  id: z.uuid(),
  track_id: z.uuid(),
  lessons: z.array(Lesson),
}).meta({ id: "Module" });
export type Module = z.infer<typeof Module>;

/** Which topics a track covers, and which of them are core (drives readiness, spec §7). */
export const TrackTopicInput = z
  .object({ topic_id: z.uuid(), is_core: z.boolean() })
  .meta({ id: "TrackTopicInput" });
export type TrackTopicInput = z.infer<typeof TrackTopicInput>;

export const TrackInput = z
  .object({
    slug: slug(),
    role: TargetRole,
    level: ExperienceLevel,
    title: title(),
    summary: summary(),
    topics: z.array(TrackTopicInput).max(40),
  })
  .meta({ id: "TrackInput" });
export type TrackInput = z.infer<typeof TrackInput>;

export const Track = z
  .object({
    id: z.uuid(),
    slug: slug(),
    role: TargetRole,
    level: ExperienceLevel,
    title: title(),
    summary: summary(),
    status: ContentStatus,
    version: z.int().min(1),
    topics: z.array(TrackTopicInput),
    modules: z.array(Module),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "Track" });
export type Track = z.infer<typeof Track>;

// -----------------------------------------------------------------------------------------------
// Candidate shapes. Deliberately separate from the admin ones: no rubric, no criteria, no level
// descriptors, no ideal points, anywhere in here.

export const CandidateLessonSummary = z
  .object({
    slug: slug(),
    title: title(),
    estimated_minutes: z.int().min(1).max(CONTENT_LIMITS.lessonMinutesMax).nullable(),
  })
  .meta({ id: "CandidateLessonSummary" });
export type CandidateLessonSummary = z.infer<typeof CandidateLessonSummary>;

export const CandidateModule = z
  .object({
    slug: slug(),
    title: title(),
    summary: summary(),
    lessons: z.array(CandidateLessonSummary),
  })
  .meta({ id: "CandidateModule" });
export type CandidateModule = z.infer<typeof CandidateModule>;

/** `GET /api/content/track?role&level` — the published track for a candidate's role and level. */
export const CandidateTrackResponse = z.object({
  slug: slug(),
  role: TargetRole,
  level: ExperienceLevel,
  title: title(),
  summary: summary(),
  modules: z.array(CandidateModule),
});
export type CandidateTrackResponse = z.infer<typeof CandidateTrackResponse>;

/** `GET /api/content/lessons/{slug}` — one published lesson, in markdown. */
export const CandidateLessonResponse = z.object({
  slug: slug(),
  title: title(),
  body: z.string().min(1).max(CONTENT_LIMITS.lessonBodyMaxLength),
  estimated_minutes: z.int().min(1).max(CONTENT_LIMITS.lessonMinutesMax).nullable(),
  topic: Topic.nullable(),
});
export type CandidateLessonResponse = z.infer<typeof CandidateLessonResponse>;

/**
 * One question as a candidate may see it: the prompt and its setup, and nothing that says what a
 * good answer contains. The interview engine (M3) reads the full form server-side.
 */
export const CandidatePracticeItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    type: QuestionType,
    difficulty: z.int().min(DIFFICULTY_RANGE.min).max(DIFFICULTY_RANGE.max),
    prompt: z.string().min(1).max(CONTENT_LIMITS.questionPromptMaxLength),
    context: z.string().min(1).max(CONTENT_LIMITS.questionContextMaxLength).nullable(),
    topic: Topic,
  })
  .meta({ id: "CandidatePracticeItem" });
export type CandidatePracticeItem = z.infer<typeof CandidatePracticeItem>;

/** `GET /api/content/practice` — published practice questions for the candidate's profile. */
export const CandidatePracticeResponse = z.object({ items: z.array(CandidatePracticeItem) });
export type CandidatePracticeResponse = z.infer<typeof CandidatePracticeResponse>;

// -----------------------------------------------------------------------------------------------
// Workflow, versions and flags.

/** Body of the transition endpoints: the move, and why (the note is kept in the version history). */
export const ContentTransitionRequest = z.object({
  transition: ContentTransition,
  note: z.string().trim().min(1).max(CONTENT_LIMITS.changeNoteMaxLength).nullable(),
});
export type ContentTransitionRequest = z.infer<typeof ContentTransitionRequest>;

export const ContentVersionSummary = z
  .object({
    version: z.int().min(1),
    change_note: z.string().min(1).max(CONTENT_LIMITS.changeNoteMaxLength).nullable(),
    created_at: z.iso.datetime(),
  })
  .meta({ id: "ContentVersionSummary" });
export type ContentVersionSummary = z.infer<typeof ContentVersionSummary>;

export const ContentVersionsResponse = z.object({ versions: z.array(ContentVersionSummary) });
export type ContentVersionsResponse = z.infer<typeof ContentVersionsResponse>;

/** One stored snapshot. `snapshot` is the entity as it was; its shape follows that entity. */
export const ContentVersionResponse = z.object({
  entity_type: ContentEntityType,
  entity_id: z.uuid(),
  version: z.int().min(1),
  change_note: z.string().min(1).max(CONTENT_LIMITS.changeNoteMaxLength).nullable(),
  created_at: z.iso.datetime(),
  snapshot: z.record(z.string(), z.unknown()),
});
export type ContentVersionResponse = z.infer<typeof ContentVersionResponse>;

/** A near-duplicate found by cosine similarity on question embeddings (ADR-0006). */
export const DuplicateMatch = z
  .object({
    question_id: z.uuid(),
    slug: slug(),
    prompt: z.string().min(1).max(CONTENT_LIMITS.questionPromptMaxLength),
    status: ContentStatus,
    similarity: z.number().min(0).max(1),
  })
  .meta({ id: "DuplicateMatch" });
export type DuplicateMatch = z.infer<typeof DuplicateMatch>;

/** Warnings, never a block: publishing succeeds and reports what it found. */
export const DuplicateWarningsResponse = z.object({ matches: z.array(DuplicateMatch) });
export type DuplicateWarningsResponse = z.infer<typeof DuplicateWarningsResponse>;

export const ContentFlagInput = z.object({
  question_id: z.uuid(),
  reason: ContentFlagReason,
  note: z.string().trim().min(1).max(CONTENT_LIMITS.flagNoteMaxLength).nullable(),
});
export type ContentFlagInput = z.infer<typeof ContentFlagInput>;

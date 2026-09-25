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
import { Slug } from "./slug.js";

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
 *
 * ## Which schemas carry `.meta({ id })`
 *
 * The same rule the registry follows (ADR-0003): a schema a controller uses as a DTO root — every
 * `*Input`, `Topic`, `Track`, `Module`, `Lesson`, `Rubric`, `Question` and the response objects —
 * carries **no** root id, because nestjs-zod would then emit two OpenAPI components with the same
 * name. Schemas that only ever appear nested inside another one do carry an id, so they become one
 * shared definition instead of being inlined at every use.
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

export const TopicInput = z.object({
  slug: slug(),
  name: title(),
  description: summary(),
});
export type TopicInput = z.infer<typeof TopicInput>;

/*
 * NOTE: `Topic` is the one schema that crosses the admin/candidate boundary — it is nested in
 * `QuestionListItem` (admin) and in `CandidateLessonResponse` and `CandidatePracticeItem`. That is
 * deliberate: a topic is neutral taxonomy and all three of its fields are safe for a candidate to
 * read. It is also the single seam where "candidate shapes are separate shapes" is not literally
 * true, so **anything added here reaches candidate payloads with no further edit**. Keep it
 * candidate-safe; an admin-only fact about a topic belongs in a separate admin shape.
 */
export const Topic = TopicInput.extend({ id: z.uuid() });
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
  });
export type RubricInput = z.infer<typeof RubricInput>;

/**
 * Whether `/content/seed` still owns this item's content (ADR-0014 decision 5): true until someone
 * saves a change to it in the CMS, after which `pnpm db:seed` reports it as skipped rather than
 * overwriting the edit. Admin shapes only — a candidate has no use for it.
 */
const seedManaged = () => z.boolean();

/**
 * Whether a model drafted this item and nobody has vouched for it yet (ADR-0014 decision 6). Set
 * by the seed importer from the file's `author`, cleared by the explicit "mark as reviewed"
 * action or by a re-import from a file that says `author: human` — never by an ordinary edit,
 * because a typo fix is not a review. In production, publishing one of these is refused unless an
 * admin acknowledges it. Admin shapes only.
 */
const aiDraftUnreviewed = () => z.boolean();

/** When it was marked reviewed, if it ever was. The reviewer's id stays server-side. */
const reviewedAt = () => z.iso.datetime().nullable();

export const Rubric = z.object({
  id: z.uuid(),
  slug: slug(),
  name: title(),
  status: ContentStatus,
  version: z.int().min(1),
  criteria: z.array(RubricCriterion),
  seed_managed: seedManaged(),
  ai_draft_unreviewed: aiDraftUnreviewed(),
  reviewed_at: reviewedAt(),
  updated_at: z.iso.datetime(),
});
export type Rubric = z.infer<typeof Rubric>;

/**
 * ANSWER KEY — a probe the engine may ask when an answer has not covered one of the rubric's
 * criteria (owner's decision, 2026-09-23; `docs/progress/2026-09-23-planned-follow-ups.md`).
 *
 * The opening prompt asks one thing, the way an interviewer does; every other criterion is asked
 * for here instead. So the rule "nothing may charge for something the candidate was never asked"
 * survives, while the prompt stops being triple-barrelled — and the engine sends the question's own
 * probes to the interviewer model rather than the rubric, which takes the answer key out of every
 * live call.
 *
 * **A menu, not a script.** The engine asks a probe only for a criterion the answer has not already
 * covered, so a complete first answer earns no follow-up at all. That condition is the engine's,
 * which is why there is no condition field here: prose the engine would have to branch on ("if they
 * have not mentioned the limit…") belongs in neither.
 */
export const PlannedFollowUp = z
  .object({
    /**
     * Which criterion this probes, by its position in the rubric — 0-based, as
     * `rubric_criteria.position` stores it and as the CMS lists them. Not the criterion's id:
     * criteria are replaced wholesale on every rubric edit, so their uuids do not survive one.
     */
    criterion: z
      .int()
      .min(0)
      .max(CONTENT_LIMITS.rubricCriteria.max - 1),
    /** One sentence, as the interviewer would say it out loud. The model phrases it in context. */
    probe: z.string().trim().min(1).max(CONTENT_LIMITS.followUpProbeMaxLength),
  })
  .meta({ id: "PlannedFollowUp" });
export type PlannedFollowUp = z.infer<typeof PlannedFollowUp>;

/**
 * **At most two probes per criterion** (owner's decision, 2026-09-23, after the QA pilot). It was
 * one, on the reasoning that `max_follow_ups` is 2 against three criteria so the engine is already
 * choosing. The pilot found the cost: a criterion that scores two separable things — "thinks past
 * the happy path **and** says where the list stops" — gets one probe, so half of it is scored and
 * never asked, which is the defect planned follow-ups exist to remove. Two is the cap because a
 * third is a criterion that should have been split.
 *
 * Which of a criterion's probes the engine asks is a selection rule, not a contract: it prefers a
 * criterion nothing has probed yet, and reaches a second probe on the same criterion only when no
 * other criterion is uncovered. So the **first** probe listed for a criterion is its primary one.
 */
export const followUpsWithinPerCriterionCap = (
  followUps: readonly { criterion: number }[],
): boolean => {
  const perCriterion = new Map<number, number>();
  for (const followUp of followUps) {
    const seen = (perCriterion.get(followUp.criterion) ?? 0) + 1;
    if (seen > CONTENT_LIMITS.followUpsPerCriterion) return false;
    perCriterion.set(followUp.criterion, seen);
  }
  return true;
};

export const QuestionInput = z.object({
  slug: slug(),
  /**
   * Which catalogue roles and levels this question is offered to, by slug (spec §6.1, ADR-0015).
   * A question may serve more than one of each — one frontend question is also a full-stack
   * question, which is why a full-stack track costs almost no new content.
   */
  roles: z.array(Slug).min(1).max(CONTENT_LIMITS.questionRoles),
  levels: z.array(Slug).min(1).max(CONTENT_LIMITS.questionLevels),
  /**
   * Which stack variants this question is for, by slug — and **empty means general** (ADR-0015).
   * A question with no stacks is offered to everyone preparing for its role; one with stacks is
   * offered only to candidates on one of them. So this list is not "which stacks does it apply
   * to" but "which stacks would it be unfair or meaningless outside of": a React code snippet is
   * tagged, a question about where state should live is not.
   *
   * No `.min(1)`, and deliberately: the empty array is the common case, not a missing value.
   */
  stacks: z.array(Slug).max(CONTENT_LIMITS.questionStacks),
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
  /**
   * ANSWER KEY — the probes for the criteria the prompt does not ask for. Empty is legitimate and
   * means the prompt asks for everything its rubric scores; `check-bank.mjs` is what holds a seed
   * bank to the house rule, because only it can see the rubric and the prompt together.
   */
  planned_follow_ups: z
    .array(PlannedFollowUp)
    .max(CONTENT_LIMITS.plannedFollowUps)
    .refine(followUpsWithinPerCriterionCap, {
      message: `a criterion may have at most ${CONTENT_LIMITS.followUpsPerCriterion} planned follow-ups`,
    }),
});
export type QuestionInput = z.infer<typeof QuestionInput>;

export const Question = QuestionInput.extend({
  id: z.uuid(),
  status: ContentStatus,
  version: z.int().min(1),
  topic: Topic,
  rubric: Rubric,
  /** Which model produced the stored embedding, so stale vectors can be found (ADR-0006). */
  embedding_model: z.string().min(1).max(60).nullable(),
  seed_managed: seedManaged(),
  ai_draft_unreviewed: aiDraftUnreviewed(),
  reviewed_at: reviewedAt(),
  updated_at: z.iso.datetime(),
});
export type Question = z.infer<typeof Question>;

export const LessonInput = z.object({
  slug: slug(),
  title: title(),
  /** The lesson itself, in markdown. */
  body: z.string().trim().min(1).max(CONTENT_LIMITS.lessonBodyMaxLength),
  topic_id: z.uuid().nullable(),
  position: z.int().min(0).max(999),
  estimated_minutes: z.int().min(1).max(CONTENT_LIMITS.lessonMinutesMax).nullable(),
});
export type LessonInput = z.infer<typeof LessonInput>;

export const Lesson = LessonInput.extend({
  id: z.uuid(),
  module_id: z.uuid(),
  status: ContentStatus,
  version: z.int().min(1),
  seed_managed: seedManaged(),
  ai_draft_unreviewed: aiDraftUnreviewed(),
  reviewed_at: reviewedAt(),
  updated_at: z.iso.datetime(),
});
export type Lesson = z.infer<typeof Lesson>;

export const ModuleInput = z.object({
  slug: slug(),
  title: title(),
  summary: summary(),
  position: z.int().min(0).max(999),
});
export type ModuleInput = z.infer<typeof ModuleInput>;

export const Module = ModuleInput.extend({
  id: z.uuid(),
  track_id: z.uuid(),
  seed_managed: seedManaged(),
  lessons: z.array(Lesson),
});
export type Module = z.infer<typeof Module>;

/** Which topics a track covers, and which of them are core (drives readiness, spec §7). */
export const TrackTopicInput = z
  .object({ topic_id: z.uuid(), is_core: z.boolean() })
  .meta({ id: "TrackTopicInput" });
export type TrackTopicInput = z.infer<typeof TrackTopicInput>;

export const TrackInput = z.object({
  slug: slug(),
  /** The catalogue role and level this track is for, by slug (ADR-0015). */
  role: Slug,
  level: Slug,
  title: title(),
  summary: summary(),
  topics: z.array(TrackTopicInput).max(40),
});
export type TrackInput = z.infer<typeof TrackInput>;

export const Track = z.object({
  id: z.uuid(),
  slug: slug(),
  role: Slug,
  level: Slug,
  title: title(),
  summary: summary(),
  status: ContentStatus,
  version: z.int().min(1),
  topics: z.array(TrackTopicInput),
  modules: z.array(Module),
  seed_managed: seedManaged(),
  ai_draft_unreviewed: aiDraftUnreviewed(),
  reviewed_at: reviewedAt(),
  updated_at: z.iso.datetime(),
});
export type Track = z.infer<typeof Track>;

// -----------------------------------------------------------------------------------------------
// Admin listing. One filter bar over four entities, and the row shapes the CMS lists.

/**
 * Query understood by every admin list endpoint. Each endpoint applies the filters that make sense
 * for its entity and ignores the rest (`type` means nothing to a track), so the CMS keeps one
 * filter bar. Paging is keyset, not offset: send the previous page's `next_cursor` back as
 * `cursor` and rows inserted meanwhile never shift a page under the reader.
 */
export const ContentListQuery = z.object({
  status: ContentStatus.optional(),
  /** Free text, matched without regard to case against the slug and the title or name. */
  q: z.string().trim().min(1).max(CONTENT_LIMITS.searchMaxLength).optional(),
  role: Slug.optional(),
  level: Slug.optional(),
  /** Questions tagged for this stack. Not "questions a candidate on it would be offered" — that
   * is the eligibility rule, which also lets general questions through; this is the CMS asking
   * "what have we written for Java / Spring". */
  stack: Slug.optional(),
  type: QuestionType.optional(),
  topic_id: z.uuid().optional(),
  cursor: z.string().min(1).max(CONTENT_LIMITS.cursorMaxLength).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CONTENT_LIMITS.pageSize.max)
    .default(CONTENT_LIMITS.pageSize.default),
});
export type ContentListQuery = z.infer<typeof ContentListQuery>;

/** Null once the last page has been read. */
const nextCursor = () => z.string().min(1).max(CONTENT_LIMITS.cursorMaxLength).nullable();

export const TrackListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    role: Slug,
    level: Slug,
    title: title(),
    status: ContentStatus,
    version: z.int().min(1),
    module_count: z.int().min(0),
    seed_managed: seedManaged(),
    ai_draft_unreviewed: aiDraftUnreviewed(),
    reviewed_at: reviewedAt(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "TrackListItem" });
export type TrackListItem = z.infer<typeof TrackListItem>;

export const TrackListResponse = z.object({
  items: z.array(TrackListItem),
  next_cursor: nextCursor(),
});
export type TrackListResponse = z.infer<typeof TrackListResponse>;

export const LessonListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    title: title(),
    module_id: z.uuid(),
    track_id: z.uuid(),
    status: ContentStatus,
    version: z.int().min(1),
    seed_managed: seedManaged(),
    ai_draft_unreviewed: aiDraftUnreviewed(),
    reviewed_at: reviewedAt(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "LessonListItem" });
export type LessonListItem = z.infer<typeof LessonListItem>;

export const LessonListResponse = z.object({
  items: z.array(LessonListItem),
  next_cursor: nextCursor(),
});
export type LessonListResponse = z.infer<typeof LessonListResponse>;

/**
 * A question as the CMS lists it. Deliberately without `ideal_points`: a list is read over
 * shoulders in a shared office, and nothing needs the answer key to draw a row.
 */
export const QuestionListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    type: QuestionType,
    roles: z.array(Slug),
    levels: z.array(Slug),
    stacks: z.array(Slug),
    difficulty: z.int().min(DIFFICULTY_RANGE.min).max(DIFFICULTY_RANGE.max),
    topic: Topic,
    rubric_slug: slug(),
    status: ContentStatus,
    version: z.int().min(1),
    seed_managed: seedManaged(),
    ai_draft_unreviewed: aiDraftUnreviewed(),
    reviewed_at: reviewedAt(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "QuestionListItem" });
export type QuestionListItem = z.infer<typeof QuestionListItem>;

export const QuestionListResponse = z.object({
  items: z.array(QuestionListItem),
  next_cursor: nextCursor(),
});
export type QuestionListResponse = z.infer<typeof QuestionListResponse>;

export const RubricListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    name: title(),
    status: ContentStatus,
    version: z.int().min(1),
    criteria_count: z.int().min(0),
    seed_managed: seedManaged(),
    ai_draft_unreviewed: aiDraftUnreviewed(),
    reviewed_at: reviewedAt(),
    updated_at: z.iso.datetime(),
  })
  .meta({ id: "RubricListItem" });
export type RubricListItem = z.infer<typeof RubricListItem>;

export const RubricListResponse = z.object({
  items: z.array(RubricListItem),
  next_cursor: nextCursor(),
});
export type RubricListResponse = z.infer<typeof RubricListResponse>;

/** The whole taxonomy: small by design, so it is not paged. */
export const TopicsResponse = z.object({ topics: z.array(Topic) });
export type TopicsResponse = z.infer<typeof TopicsResponse>;

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
  role: Slug,
  level: Slug,
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

/** Query for `GET /api/content/track`; both fall back to the candidate's own profile. */
export const CandidateTrackQuery = z.object({
  role: Slug.optional(),
  level: Slug.optional(),
});
export type CandidateTrackQuery = z.infer<typeof CandidateTrackQuery>;

/** Query for `GET /api/content/practice`; `topic` is a topic slug. */
export const CandidatePracticeQuery = z.object({
  topic: slug().optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(CONTENT_LIMITS.pageSize.max)
    .default(CONTENT_LIMITS.pageSize.default),
});
export type CandidatePracticeQuery = z.infer<typeof CandidatePracticeQuery>;

// -----------------------------------------------------------------------------------------------
// Workflow, versions and flags.

/**
 * The URL vocabulary for the entities that carry a status and a history. A module is missing on
 * purpose: it is structural, so it is versioned as part of its track (ADR-0014).
 */
export const ContentEntityPath = z
  .enum([
    "tracks",
    "lessons",
    "questions",
    "rubrics",
    // The catalogue (ADR-0015): roles, levels and stacks move through the same workflow.
    "career-roles",
    "career-levels",
    "stacks",
  ])
  .meta({ id: "ContentEntityPath" });
export type ContentEntityPath = z.infer<typeof ContentEntityPath>;

/** Body of the transition endpoints: the move, and why (the note is kept in the version history). */
export const ContentTransitionRequest = z.object({
  transition: ContentTransition,
  note: z.string().trim().min(1).max(CONTENT_LIMITS.changeNoteMaxLength).nullable(),
  /**
   * Publish this item even though a model drafted it and nobody has marked it reviewed
   * (ADR-0014 decision 6). Only production refuses such a publish, and only an admin can publish
   * at all, so this is an admin's deliberate override — the audit entry records that it was used.
   */
  acknowledge_unreviewed: z.boolean().default(false),
});
export type ContentTransitionRequest = z.infer<typeof ContentTransitionRequest>;

/** Body of the "mark as reviewed" endpoint: why, for the version history. */
export const ContentReviewRequest = z.object({
  note: z.string().trim().min(1).max(CONTENT_LIMITS.changeNoteMaxLength).nullable(),
});
export type ContentReviewRequest = z.infer<typeof ContentReviewRequest>;

/**
 * What marking an item reviewed returns. The reviewer's id is deliberately absent: the CMS shows
 * that a review happened and when, and the audit log is where "by whom" belongs.
 */
export const ContentReviewResponse = z.object({
  entity: ContentEntityPath,
  id: z.uuid(),
  ai_draft_unreviewed: z.literal(false),
  reviewed_at: z.iso.datetime(),
  version: z.int().min(1),
  updated_at: z.iso.datetime(),
});
export type ContentReviewResponse = z.infer<typeof ContentReviewResponse>;

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

/**
 * Body of `POST /api/admin/content/questions/duplicate-check`: the text a question would carry.
 * Takes the text rather than an id so the CMS can warn while a new question is still being typed.
 */
export const DuplicateCheckRequest = z.object({
  prompt: z.string().trim().min(1).max(CONTENT_LIMITS.questionPromptMaxLength),
  context: z.string().trim().min(1).max(CONTENT_LIMITS.questionContextMaxLength).nullable(),
  /** The question being edited, so that it does not report itself. */
  exclude_question_id: z.uuid().nullable(),
});
export type DuplicateCheckRequest = z.infer<typeof DuplicateCheckRequest>;

/**
 * What a transition returns: the entity's new state, not the entity. The CMS refetches what it is
 * showing, and one small shape serves all four entities.
 */
export const ContentTransitionResponse = z.object({
  entity: ContentEntityPath,
  id: z.uuid(),
  status: ContentStatus,
  version: z.int().min(1),
  updated_at: z.iso.datetime(),
  /**
   * Near-duplicates found while publishing a question (ADR-0006). A warning and never a refusal:
   * the publish already happened. Empty for every other entity, and when the worker was unreachable.
   */
  duplicates: z.array(DuplicateMatch),
});
export type ContentTransitionResponse = z.infer<typeof ContentTransitionResponse>;

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

export const ContentFlagInput = z.object({
  question_id: z.uuid(),
  reason: ContentFlagReason,
  note: z.string().trim().min(1).max(CONTENT_LIMITS.flagNoteMaxLength).nullable(),
});
export type ContentFlagInput = z.infer<typeof ContentFlagInput>;

import type {
  CandidateLessonResponse,
  CandidateModule,
  CandidatePracticeItem,
  CandidateTrackResponse,
  Lesson,
  LessonInput,
  LessonListItem,
  Module,
  ModuleInput,
  Question,
  QuestionInput,
  QuestionListItem,
  Rubric,
  RubricInput,
  RubricListItem,
  Topic,
  Track,
  TrackInput,
  TrackListItem,
} from "@readi/shared-types";
import { Prisma } from "../generated/prisma/client";

/**
 * Database rows → contracts. Two families live here and they never meet: `to*` builds the admin
 * shapes, `toCandidate*` builds the candidate ones **field by field from the row**, never by
 * trimming an admin shape. That is the whole defence against leaking an answer key: there is no
 * code path where a rubric, a criterion, a level descriptor or an ideal point could travel into a
 * candidate payload and then have to be removed (ADR-0014).
 */

// Ordering is part of the contract: a reader must see modules and lessons in the author's order.
const byPosition = [{ position: Prisma.SortOrder.asc }, { slug: Prisma.SortOrder.asc }];

export const rubricInclude = {
  criteria: { orderBy: [{ position: Prisma.SortOrder.asc }] },
} satisfies Prisma.RubricInclude;

export const questionInclude = {
  topic: true,
  rubric: { include: rubricInclude },
} satisfies Prisma.QuestionInclude;

export const trackInclude = {
  topics: { orderBy: [{ topicId: Prisma.SortOrder.asc }] },
  modules: { orderBy: byPosition, include: { lessons: { orderBy: byPosition } } },
} satisfies Prisma.TrackInclude;

export const moduleInclude = {
  lessons: { orderBy: byPosition },
} satisfies Prisma.ModuleInclude;

export type RubricRow = Prisma.RubricGetPayload<{ include: typeof rubricInclude }>;
export type QuestionRow = Prisma.QuestionGetPayload<{ include: typeof questionInclude }>;
export type TrackRow = Prisma.TrackGetPayload<{ include: typeof trackInclude }>;
export type ModuleRow = Prisma.ModuleGetPayload<{ include: typeof moduleInclude }>;
export type LessonRow = Prisma.LessonGetPayload<Record<string, never>>;
export type TopicRow = Prisma.TopicGetPayload<Record<string, never>>;

const iso = (date: Date) => date.toISOString();

// -----------------------------------------------------------------------------------------------
// Admin shapes.

export const toTopic = (row: TopicRow): Topic => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  description: row.description,
});

/** Level descriptors are JSONB; the column is written only from a validated `RubricInput`. */
const toLevels = (levels: Prisma.JsonValue): RubricInput["criteria"][number]["levels"] =>
  levels as RubricInput["criteria"][number]["levels"];

export const toRubric = (row: RubricRow): Rubric => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  version: row.version,
  criteria: row.criteria.map((criterion) => ({
    id: criterion.id,
    dimension: criterion.dimension,
    description: criterion.description,
    weight: criterion.weight,
    levels: toLevels(criterion.levels),
  })),
  updated_at: iso(row.updatedAt),
});

export const toQuestion = (row: QuestionRow): Question => ({
  id: row.id,
  slug: row.slug,
  roles: row.roles,
  levels: row.levels,
  type: row.type,
  topic_id: row.topicId,
  subtopic: row.subtopic,
  difficulty: row.difficulty,
  prompt: row.prompt,
  context: row.context,
  rubric_id: row.rubricId,
  ideal_points: row.idealPoints,
  status: row.status,
  version: row.version,
  topic: toTopic(row.topic),
  rubric: toRubric(row.rubric),
  embedding_model: row.embeddingModel,
  updated_at: iso(row.updatedAt),
});

export const toLesson = (row: LessonRow): Lesson => ({
  id: row.id,
  module_id: row.moduleId,
  slug: row.slug,
  title: row.title,
  body: row.body,
  topic_id: row.topicId,
  position: row.position,
  estimated_minutes: row.estimatedMinutes,
  status: row.status,
  version: row.version,
  updated_at: iso(row.updatedAt),
});

export const toModule = (row: ModuleRow): Module => ({
  id: row.id,
  track_id: row.trackId,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  position: row.position,
  lessons: row.lessons.map(toLesson),
});

export const toTrack = (row: TrackRow): Track => ({
  id: row.id,
  slug: row.slug,
  role: row.role,
  level: row.level,
  title: row.title,
  summary: row.summary,
  status: row.status,
  version: row.version,
  topics: row.topics.map((link) => ({ topic_id: link.topicId, is_core: link.isCore })),
  modules: row.modules.map(toModule),
  updated_at: iso(row.updatedAt),
});

// -----------------------------------------------------------------------------------------------
// List rows.

export const toTrackListItem = (
  row: Prisma.TrackGetPayload<{ include: { _count: { select: { modules: true } } } }>,
): TrackListItem => ({
  id: row.id,
  slug: row.slug,
  role: row.role,
  level: row.level,
  title: row.title,
  status: row.status,
  version: row.version,
  module_count: row._count.modules,
  updated_at: iso(row.updatedAt),
});

export const toLessonListItem = (
  row: Prisma.LessonGetPayload<{ include: { module: { select: { trackId: true } } } }>,
): LessonListItem => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  module_id: row.moduleId,
  track_id: row.module.trackId,
  status: row.status,
  version: row.version,
  updated_at: iso(row.updatedAt),
});

export const toQuestionListItem = (
  row: Prisma.QuestionGetPayload<{
    include: { topic: true; rubric: { select: { slug: true } } };
  }>,
): QuestionListItem => ({
  id: row.id,
  slug: row.slug,
  type: row.type,
  roles: row.roles,
  levels: row.levels,
  difficulty: row.difficulty,
  topic: toTopic(row.topic),
  rubric_slug: row.rubric.slug,
  status: row.status,
  version: row.version,
  updated_at: iso(row.updatedAt),
});

export const toRubricListItem = (
  row: Prisma.RubricGetPayload<{ include: { _count: { select: { criteria: true } } } }>,
): RubricListItem => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  version: row.version,
  criteria_count: row._count.criteria,
  updated_at: iso(row.updatedAt),
});

// -----------------------------------------------------------------------------------------------
// Content projections: what an editor edits, and therefore what a version snapshot holds and what
// "has this actually changed?" compares (ADR-0014 decision 2). Ids, timestamps, status and version
// are deliberately absent — they are not the content.

/** Topic links are a set, not a list: compared and stored in a fixed order so equal means equal. */
export const sortTopics = <T extends { topic_id: string }>(topics: readonly T[]): T[] =>
  [...topics].sort((a, b) => (a.topic_id < b.topic_id ? -1 : a.topic_id > b.topic_id ? 1 : 0));

/** What a track's own editor edits — the shape an update sends, for comparing like with like. */
export const trackInputOf = (row: TrackRow): TrackInput => ({
  slug: row.slug,
  role: row.role,
  level: row.level,
  title: row.title,
  summary: row.summary,
  topics: sortTopics(row.topics.map((link) => ({ topic_id: link.topicId, is_core: link.isCore }))),
});

/**
 * A track's snapshot also holds its modules: a module has no status or history of its own, so
 * adding, renaming or reordering one is a change to the track (ADR-0014 decision 1).
 */
export const trackContent = (row: TrackRow): TrackInput & { modules: ModuleInput[] } => ({
  ...trackInputOf(row),
  modules: row.modules.map((module) => ({
    slug: module.slug,
    title: module.title,
    summary: module.summary,
    position: module.position,
  })),
});

export const lessonContent = (row: LessonRow): LessonInput => ({
  slug: row.slug,
  title: row.title,
  body: row.body,
  topic_id: row.topicId,
  position: row.position,
  estimated_minutes: row.estimatedMinutes,
});

export const rubricContent = (row: RubricRow): RubricInput => ({
  slug: row.slug,
  name: row.name,
  criteria: row.criteria.map((criterion) => ({
    dimension: criterion.dimension,
    description: criterion.description,
    weight: criterion.weight,
    levels: toLevels(criterion.levels),
  })),
});

export const questionContent = (row: QuestionRow): QuestionInput => ({
  slug: row.slug,
  roles: row.roles,
  levels: row.levels,
  type: row.type,
  topic_id: row.topicId,
  subtopic: row.subtopic,
  difficulty: row.difficulty,
  prompt: row.prompt,
  context: row.context,
  rubric_id: row.rubricId,
  ideal_points: row.idealPoints,
});

// -----------------------------------------------------------------------------------------------
// Candidate shapes. Built from the row, field by field. Nothing here reads a rubric, a criterion,
// a level descriptor or an ideal point — there is no such field to read from what these take.

export const toCandidateTrack = (row: TrackRow): CandidateTrackResponse => ({
  slug: row.slug,
  role: row.role,
  level: row.level,
  title: row.title,
  summary: row.summary,
  modules: row.modules.map((module): CandidateModule => ({
    slug: module.slug,
    title: module.title,
    summary: module.summary,
    lessons: module.lessons.map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      estimated_minutes: lesson.estimatedMinutes,
    })),
  })),
});

export const toCandidateLesson = (
  row: LessonRow & { topic: TopicRow | null },
): CandidateLessonResponse => ({
  slug: row.slug,
  title: row.title,
  body: row.body,
  estimated_minutes: row.estimatedMinutes,
  topic: row.topic ? toTopic(row.topic) : null,
});

export const toCandidatePracticeItem = (
  row: Prisma.QuestionGetPayload<{ include: { topic: true } }>,
): CandidatePracticeItem => ({
  id: row.id,
  slug: row.slug,
  type: row.type,
  difficulty: row.difficulty,
  prompt: row.prompt,
  context: row.context,
  topic: toTopic(row.topic),
});

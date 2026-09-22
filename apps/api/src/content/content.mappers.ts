import type {
  CandidateCareerRole,
  CandidateLessonResponse,
  CandidateModule,
  CandidatePracticeItem,
  CandidateTrackResponse,
  CareerLevel,
  CareerLevelInput,
  CareerLevelListItem,
  CareerRole,
  CareerRoleInput,
  CareerRoleListItem,
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
  Stack,
  StackInput,
  StackListItem,
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

/**
 * A question's roles and levels are a **set**, but they travel as an array, so they are read in
 * one fixed order — by slug — everywhere. `sameContent` compares the projection field by field
 * (ADR-0014 decision 2): without a canonical order, saving a form that reordered nothing would
 * look like a change and write a version snapshot nobody asked for.
 */
const bySlug = { orderBy: { slug: Prisma.SortOrder.asc } };

export const questionLinkInclude = {
  /*
   * `status` alongside the slug because publishing a question has to know whether the catalogue
   * rows it is tagged with are published themselves: a question tagged only with a draft stack is
   * offered to nobody, since nobody may choose that variant (`assertPublishable`). Only the slug
   * reaches the wire.
   */
  roles: {
    orderBy: { role: bySlug.orderBy },
    include: { role: { select: { slug: true, status: true } } },
  },
  levels: {
    orderBy: { level: bySlug.orderBy },
    include: { level: { select: { slug: true, status: true } } },
  },
  stacks: {
    orderBy: { stack: bySlug.orderBy },
    include: { stack: { select: { slug: true, status: true } } },
  },
} satisfies Prisma.QuestionInclude;

export const questionInclude = {
  ...questionLinkInclude,
  topic: true,
  rubric: { include: rubricInclude },
} satisfies Prisma.QuestionInclude;

/** A track names one role and one level; only their slugs reach the wire (ADR-0015). */
export const trackCatalogueInclude = {
  role: { select: { slug: true } },
  level: { select: { slug: true } },
} satisfies Prisma.TrackInclude;

export const trackInclude = {
  ...trackCatalogueInclude,
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

/**
 * The review state the CMS shows (ADR-0014 decision 6): whether a model drafted this and nobody
 * has vouched for it, and when a review was recorded. The reviewer's id stays server-side — the
 * audit log is where "by whom" belongs.
 */
const review = (row: { aiDraftUnreviewed: boolean; reviewedAt: Date | null }) => ({
  ai_draft_unreviewed: row.aiDraftUnreviewed,
  reviewed_at: row.reviewedAt ? iso(row.reviewedAt) : null,
});

export const toRubric = (row: RubricRow): Rubric => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
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
  roles: row.roles.map((link) => link.role.slug),
  levels: row.levels.map((link) => link.level.slug),
  stacks: row.stacks.map((link) => link.stack.slug),
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
  seed_managed: row.seedManaged,
  ...review(row),
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
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toModule = (row: ModuleRow): Module => ({
  id: row.id,
  track_id: row.trackId,
  slug: row.slug,
  title: row.title,
  summary: row.summary,
  position: row.position,
  seed_managed: row.seedManaged,
  lessons: row.lessons.map(toLesson),
});

export const toTrack = (row: TrackRow): Track => ({
  id: row.id,
  slug: row.slug,
  role: row.role.slug,
  level: row.level.slug,
  title: row.title,
  summary: row.summary,
  status: row.status,
  version: row.version,
  topics: row.topics.map((link) => ({ topic_id: link.topicId, is_core: link.isCore })),
  modules: row.modules.map(toModule),
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

// -----------------------------------------------------------------------------------------------
// List rows.

export const toTrackListItem = (
  row: Prisma.TrackGetPayload<{
    include: typeof trackCatalogueInclude & { _count: { select: { modules: true } } };
  }>,
): TrackListItem => ({
  id: row.id,
  slug: row.slug,
  role: row.role.slug,
  level: row.level.slug,
  title: row.title,
  status: row.status,
  version: row.version,
  module_count: row._count.modules,
  seed_managed: row.seedManaged,
  ...review(row),
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
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toQuestionListItem = (
  row: Prisma.QuestionGetPayload<{
    include: typeof questionLinkInclude & { topic: true; rubric: { select: { slug: true } } };
  }>,
): QuestionListItem => ({
  id: row.id,
  slug: row.slug,
  type: row.type,
  roles: row.roles.map((link) => link.role.slug),
  levels: row.levels.map((link) => link.level.slug),
  stacks: row.stacks.map((link) => link.stack.slug),
  difficulty: row.difficulty,
  topic: toTopic(row.topic),
  rubric_slug: row.rubric.slug,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
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
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

// -----------------------------------------------------------------------------------------------
// Content projections: what an editor edits, and therefore what a version snapshot holds and what
// "has this actually changed?" compares (ADR-0014 decision 2). Ids, timestamps, status and version
// are deliberately absent — they are not the content.

/** Topic links are a set, not a list: compared and stored in a fixed order so equal means equal. */
export const sortTopics = <T extends { topic_id: string }>(topics: readonly T[]): T[] =>
  [...topics].sort((a, b) => (a.topic_id < b.topic_id ? -1 : a.topic_id > b.topic_id ? 1 : 0));

/**
 * The same rule for a question's roles and levels, and for the same reason. `questionContent`
 * reads them back from the join tables sorted by slug, so an input that lists the same roles in a
 * different order must sort to the same thing — otherwise re-importing an unchanged seed file
 * writes a version snapshot for a question nobody touched, which `content-seed.int.spec.ts`
 * catches by importing the real corpus twice.
 *
 * A question's roles really are a set: they decide who is offered it, and nothing renders them in
 * order. A role's *stacks* are the opposite case and are deliberately not sorted — their order is
 * what a candidate sees in the picker, so reordering them is a change (`careerRoleContent`).
 */
export const canonicalQuestionInput = (input: QuestionInput): QuestionInput => ({
  ...input,
  roles: [...input.roles].sort(),
  levels: [...input.levels].sort(),
  stacks: [...input.stacks].sort(),
});

/** What a track's own editor edits — the shape an update sends, for comparing like with like. */
export const trackInputOf = (row: TrackRow): TrackInput => ({
  slug: row.slug,
  role: row.role.slug,
  level: row.level.slug,
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

/*
 * The read side of the same set rule. The database orders these by slug, and the input side sorts
 * with JavaScript's `.sort()` — two collations that agree today for every slug we ship, and not by
 * anything stronger than coincidence: glibc's `en_US.UTF-8` ignores a hyphen at the primary weight
 * and UTF-16 code units do not, so `vue-x` / `vuen` would order differently in the two. Sorting
 * here as well makes both sides one comparison, and the idempotency test that caught the original
 * ordering bug stays meaningful (M2.5 review, 2026-09-22).
 */
export const questionContent = (row: QuestionRow): QuestionInput => ({
  slug: row.slug,
  roles: row.roles.map((link) => link.role.slug).sort(),
  levels: row.levels.map((link) => link.level.slug).sort(),
  stacks: row.stacks.map((link) => link.stack.slug).sort(),
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
  role: row.role.slug,
  level: row.level.slug,
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

// -----------------------------------------------------------------------------------------------
// The catalogue: career roles, career levels and stacks (ADR-0015). Same three families as above —
// admin shapes, list rows and content projections — plus one candidate shape, which carries
// resolved names because a picker cannot draw a uuid.

const byPositionOnly = [{ position: Prisma.SortOrder.asc }];

/** What the CMS edits: the links in display order, as ids. */
export const careerRoleInclude = {
  levels: { orderBy: byPositionOnly },
  stacks: { orderBy: byPositionOnly },
} satisfies Prisma.CareerRoleInclude;

/**
 * What a candidate is offered: the same links, resolved, and **published only**. A level or stack
 * retired after its role was published stops being offered rather than being offered and refused.
 */
export const publishedCareerRoleInclude = {
  levels: {
    where: { level: { status: "published" as const } },
    orderBy: byPositionOnly,
    include: { level: true },
  },
  stacks: {
    where: { stack: { status: "published" as const } },
    orderBy: byPositionOnly,
    include: { stack: true },
  },
} satisfies Prisma.CareerRoleInclude;

export type CareerRoleRow = Prisma.CareerRoleGetPayload<{ include: typeof careerRoleInclude }>;
export type PublishedCareerRoleRow = Prisma.CareerRoleGetPayload<{
  include: typeof publishedCareerRoleInclude;
}>;
export type CareerLevelRow = Prisma.CareerLevelGetPayload<Record<string, never>>;
export type StackRow = Prisma.StackGetPayload<Record<string, never>>;

export const toCareerRole = (row: CareerRoleRow): CareerRole => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  position: row.position,
  supported_question_types: row.supportedQuestionTypes,
  levels: row.levels.map((link) => link.levelId),
  stacks: row.stacks.map((link) => ({ stack_id: link.stackId, is_default: link.isDefault })),
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toCareerLevel = (row: CareerLevelRow): CareerLevel => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  rank: row.rank,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toStack = (row: StackRow): Stack => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toCareerRoleListItem = (
  row: Prisma.CareerRoleGetPayload<{
    include: { _count: { select: { levels: true; stacks: true } } };
  }>,
): CareerRoleListItem => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  position: row.position,
  level_count: row._count.levels,
  stack_count: row._count.stacks,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toCareerLevelListItem = (
  row: Prisma.CareerLevelGetPayload<{ include: { _count: { select: { roles: true } } } }>,
): CareerLevelListItem => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  rank: row.rank,
  role_count: row._count.roles,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

export const toStackListItem = (
  row: Prisma.StackGetPayload<{ include: { _count: { select: { roles: true } } } }>,
): StackListItem => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  role_count: row._count.roles,
  status: row.status,
  version: row.version,
  seed_managed: row.seedManaged,
  ...review(row),
  updated_at: iso(row.updatedAt),
});

/**
 * What a role's editor edits. Unlike a track's topics, the links are **not** sorted into a
 * canonical order before comparing: their order is the content — it is what a candidate sees in
 * the picker — so reordering a role's stacks is a change, and earns a version.
 */
export const careerRoleContent = (row: CareerRoleRow): CareerRoleInput => ({
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  position: row.position,
  supported_question_types: row.supportedQuestionTypes,
  levels: row.levels.map((link) => link.levelId),
  stacks: row.stacks.map((link) => ({ stack_id: link.stackId, is_default: link.isDefault })),
});

export const careerLevelContent = (row: CareerLevelRow): CareerLevelInput => ({
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  rank: row.rank,
});

export const stackContent = (row: StackRow): StackInput => ({
  slug: row.slug,
  name: row.name,
  summary: row.summary,
});

export const toCandidateCareerRole = (row: PublishedCareerRoleRow): CandidateCareerRole => ({
  slug: row.slug,
  name: row.name,
  summary: row.summary,
  supported_question_types: row.supportedQuestionTypes,
  level_options: row.levels.map((link) => ({
    slug: link.level.slug,
    name: link.level.name,
    summary: link.level.summary,
  })),
  stacks: row.stacks.map((link) => ({
    slug: link.stack.slug,
    name: link.stack.name,
    summary: link.stack.summary,
    is_default: link.isDefault,
  })),
});

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  type CandidateLessonResponse,
  type CandidatePracticeQuery,
  type CandidatePracticeResponse,
  type CandidateTrackQuery,
  type CandidateTrackResponse,
  type ContentEntityPath,
  type ContentEntityType,
  type ContentListQuery,
  type ContentReviewRequest,
  type ContentReviewResponse,
  type ContentStatus,
  type ContentTransitionRequest,
  type ContentTransitionResponse,
  type ContentVersionResponse,
  type ContentVersionsResponse,
  type DuplicateCheckRequest,
  type DuplicateMatch,
  type ExperienceLevel,
  type Lesson,
  type LessonInput,
  type LessonListResponse,
  type Module,
  type ModuleInput,
  type Question,
  type QuestionInput,
  type QuestionListResponse,
  type Rubric,
  type RubricInput,
  type RubricListResponse,
  type SeedAuthor,
  type TargetRole,
  type Topic,
  type TopicInput,
  type TopicsResponse,
  type Track,
  type TrackInput,
  type TrackListResponse,
  weightsTotalCorrectly,
} from "@readi/shared-types";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedUser } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { Prisma } from "../generated/prisma/client";
import { ApiError, fieldError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { cursorWhere, paginate } from "./content-cursor";
import { sameContent } from "./content-diff";
import { checkTransition, publishNeedsReview } from "./content-workflow";
import { QuestionEmbeddingsService } from "./question-embeddings.service";
import {
  lessonContent,
  moduleInclude,
  questionContent,
  questionInclude,
  rubricContent,
  rubricInclude,
  sortTopics,
  toCandidateLesson,
  toCandidatePracticeItem,
  toCandidateTrack,
  toLesson,
  toLessonListItem,
  toModule,
  toQuestion,
  toQuestionListItem,
  toRubric,
  toRubricListItem,
  toTopic,
  toTrack,
  toTrackListItem,
  trackContent,
  trackInputOf,
  type LessonRow,
  type QuestionRow,
  type RubricRow,
  type TrackRow,
  trackInclude,
} from "./content.mappers";

/**
 * Learning content: the CMS behind `/api/admin/content/*` and the published reads behind
 * `/api/content/*` (spec §4.2, §4.8, §6.1; ADR-0014).
 *
 * Four rules hold this file together:
 *
 * 1. **Candidates see published content only**, and never the answer key. The candidate reads at
 *    the bottom select what they need and map it with the `toCandidate*` mappers, which have no
 *    field a rubric could travel in. `content-no-answer-key.int.spec.ts` proves it over raw JSON.
 * 2. **Every mutation is one transaction**: the row, its version snapshot and its audit entry
 *    land together or not at all.
 * 3. **A snapshot is written only when the content actually changed.** Saving a form twice, or
 *    running the seed importer twice, leaves no trail of identical versions.
 * 4. **Every content write records who owns the words.** `seed_managed` stays true only while
 *    `/content/seed` is the source; the first CMS edit clears it and the importer stops
 *    overwriting that item (ADR-0014 decision 5). Transitions leave it untouched.
 */

const ENTITY_TYPE: Readonly<Record<ContentEntityPath, ContentEntityType>> = {
  tracks: "track",
  lessons: "lesson",
  questions: "question",
  rubrics: "rubric",
};

/** What the version history says about a review that came with no note of its own. */
const REVIEW_NOTE = "marked reviewed";

const contains = (q: string) => ({ contains: q, mode: Prisma.QueryMode.insensitive });

const isPrismaError = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * Who is making a change. `id` is null for the seed importer and other CLIs: they act as the
 * system, so the audit row says `system` and the authorship column stays empty rather than
 * pointing at whichever admin happened to run the command.
 *
 * `source` is a different question — not who, but *where the words come from*. Only the seed
 * importer writes as `seed`; everything else is a person in the CMS (ADR-0014 decision 5).
 */
export interface Actor {
  id: string | null;
  role: AuthenticatedUser["role"];
  source?: "cms" | "seed";
  /**
   * Only meaningful with `source: "seed"`: the `author` of the file being imported, which is the
   * file's claim about whether a person has vouched for these words (ADR-0014 decision 6).
   */
  drafted?: SeedAuthor;
}

/** The CLIs. An admin's authority, nobody's name. */
export const SYSTEM_ACTOR: Actor = { id: null, role: "admin" };

/** The seed importer writing one file, carrying that file's `author`. */
export const seedActor = (author: SeedAuthor): Actor => ({
  ...SYSTEM_ACTOR,
  source: "seed",
  drafted: author,
});

/**
 * The seed importer with nothing claimed about authorship. That counts as an AI draft: an import
 * that does not say a person wrote it is the case the guard exists for.
 */
export const SEED_ACTOR: Actor = seedActor("ai_draft");

const actorType = (actor: Actor) => (actor.id ? "admin" : "system");

/**
 * Who owns the content this write is about to store. Set on every content write and **never** on a
 * transition: publishing seeded content is not a claim on its words (ADR-0014 decision 5).
 */
const ownership = (actor: Actor) => ({ seedManaged: actor.source === "seed" });

/**
 * Ownership **plus review state**, for the four entities that can be published (ADR-0014
 * decision 6). Only the importer writes the review state, from the file's `author`:
 *
 * - `ai_draft` marks the row unreviewed and clears any earlier review, because the review was of
 *   words this write is replacing;
 * - `human` clears the mark — the file now says a person stands behind it.
 *
 * A CMS write deliberately leaves all of it alone. Clearing the mark on a save would mean a
 * perfect draft needed a fake edit to be approved, and a one-word typo fix counted as reviewing
 * the whole question and its rubric. Review is its own action, `markReviewed`.
 */
const authorship = (
  actor: Actor,
): {
  seedManaged: boolean;
  aiDraftUnreviewed?: boolean;
  reviewedAt?: null;
  reviewedByUserId?: null;
} => {
  if (actor.source !== "seed") return ownership(actor);
  const unreviewed = actor.drafted !== "human";
  return {
    ...ownership(actor),
    aiDraftUnreviewed: unreviewed,
    ...(unreviewed ? { reviewedAt: null, reviewedByUserId: null } : {}),
  };
};

/** What a mutation needs to record itself: who, what changed, and why. */
interface ChangeContext {
  actor: Actor;
  note?: string | null;
}

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly embeddings: QuestionEmbeddingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Topics. A small curated taxonomy: no status, no history, no paging.

  async listTopics(): Promise<TopicsResponse> {
    const topics = await this.prisma.topic.findMany({ orderBy: { slug: "asc" } });
    return { topics: topics.map(toTopic) };
  }

  async createTopic(actor: Actor, input: TopicInput): Promise<Topic> {
    const topic = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.topic.create({
          data: {
            slug: input.slug,
            name: input.name,
            description: input.description,
            ...ownership(actor),
          },
        });
        await this.audit.record(
          {
            actorType: actorType(actor),
            actorId: actor.id,
            action: "content.topic.created",
            targetType: "topic",
            targetId: row.id,
          },
          tx,
        );
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    return toTopic(topic);
  }

  async updateTopic(actor: Actor, id: string, input: TopicInput): Promise<Topic> {
    await this.findTopicOrFail(id);
    const topic = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.topic.update({
          where: { id },
          data: {
            slug: input.slug,
            name: input.name,
            description: input.description,
            ...ownership(actor),
          },
        });
        await this.audit.record(
          {
            actorType: actorType(actor),
            actorId: actor.id,
            action: "content.topic.updated",
            targetType: "topic",
            targetId: row.id,
          },
          tx,
        );
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    return toTopic(topic);
  }

  // ---------------------------------------------------------------------------------------------
  // Tracks.

  async listTracks(query: ContentListQuery): Promise<TrackListResponse> {
    const rows = await this.prisma.track.findMany({
      where: {
        AND: [
          cursorWhere(query.cursor) ?? {},
          query.status ? { status: query.status } : {},
          query.role ? { role: query.role } : {},
          query.level ? { level: query.level } : {},
          this.trackSearch(query.q),
        ],
      },
      include: { _count: { select: { modules: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const page = paginate(rows, query.limit);
    return { items: page.items.map(toTrackListItem), next_cursor: page.next_cursor };
  }

  async getTrack(id: string): Promise<Track> {
    return toTrack(await this.findTrackOrFail(id));
  }

  async createTrack(actor: Actor, input: TrackInput): Promise<Track> {
    const track = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.track.create({
          data: {
            slug: input.slug,
            role: input.role,
            level: input.level,
            title: input.title,
            summary: input.summary,
            createdByUserId: actor.id,
            ...authorship(actor),
            topics: {
              create: sortTopics(input.topics).map((link) => ({
                topicId: link.topic_id,
                isCore: link.is_core,
              })),
            },
          },
          include: trackInclude,
        });
        await this.recordCreation(actor, "track", row.id, row.status, tx);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topics"));
    return toTrack(track);
  }

  async updateTrack(
    id: string,
    input: TrackInput,
    context: ChangeContext,
  ): Promise<{ entity: Track; changed: boolean }> {
    const current = await this.findTrackOrFail(id);
    if (sameContent(trackInputOf(current), { ...input, topics: sortTopics(input.topics) })) {
      return { entity: toTrack(current), changed: false };
    }
    const updated = await this.prisma
      .$transaction(async (tx) => {
        await this.writeSnapshot(tx, "track", current, trackContent(current), context);
        await tx.trackTopic.deleteMany({ where: { trackId: id } });
        const row = await tx.track.update({
          where: { id },
          data: {
            slug: input.slug,
            role: input.role,
            level: input.level,
            title: input.title,
            summary: input.summary,
            version: { increment: 1 },
            ...authorship(context.actor),
            topics: {
              create: sortTopics(input.topics).map((link) => ({
                topicId: link.topic_id,
                isCore: link.is_core,
              })),
            },
          },
          include: trackInclude,
        });
        await this.recordUpdate(tx, context.actor, "track", row.id, row.status, row.version);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topics"));
    return { entity: toTrack(updated), changed: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Modules. Structural: they have no status of their own, so an edit versions the track.

  async createModule(trackId: string, input: ModuleInput, context: ChangeContext): Promise<Module> {
    const track = await this.findTrackOrFail(trackId);
    const created = await this.prisma
      .$transaction(async (tx) => {
        await this.writeSnapshot(tx, "track", track, trackContent(track), context);
        const row = await tx.module.create({
          // The module's own ownership; the track's is left alone, because the importer
          // updates a track's own fields and its modules as separate decisions.
          data: {
            trackId,
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            position: input.position,
            ...ownership(context.actor),
          },
          include: moduleInclude,
        });
        await tx.track.update({ where: { id: trackId }, data: { version: { increment: 1 } } });
        await this.recordUpdate(
          tx,
          context.actor,
          "track",
          trackId,
          track.status,
          track.version + 1,
        );
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    return toModule(created);
  }

  async updateModule(
    id: string,
    input: ModuleInput,
    context: ChangeContext,
  ): Promise<{ entity: Module; changed: boolean }> {
    const current = await this.prisma.module.findUnique({ where: { id }, include: moduleInclude });
    if (!current) throw this.notFound("module_not_found");
    const before: ModuleInput = {
      slug: current.slug,
      title: current.title,
      summary: current.summary,
      position: current.position,
    };
    if (sameContent(before, input)) return { entity: toModule(current), changed: false };

    const track = await this.findTrackOrFail(current.trackId);
    const updated = await this.prisma
      .$transaction(async (tx) => {
        await this.writeSnapshot(tx, "track", track, trackContent(track), context);
        const row = await tx.module.update({
          where: { id },
          data: {
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            position: input.position,
            ...ownership(context.actor),
          },
          include: moduleInclude,
        });
        await tx.track.update({ where: { id: track.id }, data: { version: { increment: 1 } } });
        await this.recordUpdate(
          tx,
          context.actor,
          "track",
          track.id,
          track.status,
          track.version + 1,
        );
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    return { entity: toModule(updated), changed: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Lessons.

  async listLessons(query: ContentListQuery): Promise<LessonListResponse> {
    const rows = await this.prisma.lesson.findMany({
      where: {
        AND: [
          cursorWhere(query.cursor) ?? {},
          query.status ? { status: query.status } : {},
          query.topic_id ? { topicId: query.topic_id } : {},
          this.lessonSearch(query.q),
        ],
      },
      include: { module: { select: { trackId: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const page = paginate(rows, query.limit);
    return { items: page.items.map(toLessonListItem), next_cursor: page.next_cursor };
  }

  async getLesson(id: string): Promise<Lesson> {
    return toLesson(await this.findLessonOrFail(id));
  }

  async createLesson(actor: Actor, moduleId: string, input: LessonInput): Promise<Lesson> {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!module) throw this.notFound("module_not_found");
    const lesson = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.lesson.create({
          data: {
            moduleId,
            slug: input.slug,
            title: input.title,
            body: input.body,
            topicId: input.topic_id,
            position: input.position,
            estimatedMinutes: input.estimated_minutes,
            createdByUserId: actor.id,
            ...authorship(actor),
          },
        });
        await this.recordCreation(actor, "lesson", row.id, row.status, tx);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topic_id"));
    return toLesson(lesson);
  }

  async updateLesson(
    id: string,
    input: LessonInput,
    context: ChangeContext,
  ): Promise<{ entity: Lesson; changed: boolean }> {
    const current = await this.findLessonOrFail(id);
    if (sameContent(lessonContent(current), input)) {
      return { entity: toLesson(current), changed: false };
    }
    const updated = await this.prisma
      .$transaction(async (tx) => {
        await this.writeSnapshot(tx, "lesson", current, lessonContent(current), context);
        const row = await tx.lesson.update({
          where: { id },
          data: {
            slug: input.slug,
            title: input.title,
            body: input.body,
            topicId: input.topic_id,
            position: input.position,
            estimatedMinutes: input.estimated_minutes,
            version: { increment: 1 },
            ...authorship(context.actor),
          },
        });
        await this.recordUpdate(tx, context.actor, "lesson", row.id, row.status, row.version);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topic_id"));
    return { entity: toLesson(updated), changed: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Rubrics. The answer key's home: criteria, weights and the five level descriptors.

  async listRubrics(query: ContentListQuery): Promise<RubricListResponse> {
    const rows = await this.prisma.rubric.findMany({
      where: {
        AND: [
          cursorWhere(query.cursor) ?? {},
          query.status ? { status: query.status } : {},
          this.rubricSearch(query.q),
        ],
      },
      include: { _count: { select: { criteria: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const page = paginate(rows, query.limit);
    return { items: page.items.map(toRubricListItem), next_cursor: page.next_cursor };
  }

  async getRubric(id: string): Promise<Rubric> {
    return toRubric(await this.findRubricOrFail(id));
  }

  async createRubric(actor: Actor, input: RubricInput): Promise<Rubric> {
    const rubric = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.rubric.create({
          data: {
            slug: input.slug,
            name: input.name,
            createdByUserId: actor.id,
            ...authorship(actor),
            criteria: { create: this.criteriaRows(input) },
          },
          include: rubricInclude,
        });
        await this.recordCreation(actor, "rubric", row.id, row.status, tx);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    return toRubric(rubric);
  }

  async updateRubric(
    id: string,
    input: RubricInput,
    context: ChangeContext,
  ): Promise<{ entity: Rubric; changed: boolean }> {
    const current = await this.findRubricOrFail(id);
    if (sameContent(rubricContent(current), input)) {
      return { entity: toRubric(current), changed: false };
    }
    const updated = await this.prisma
      .$transaction(async (tx) => {
        await this.writeSnapshot(tx, "rubric", current, rubricContent(current), context);
        // Criteria are replaced wholesale: they are parts of the rubric, not rows with a life of
        // their own, and an editor who reorders them means exactly that.
        await tx.rubricCriterion.deleteMany({ where: { rubricId: id } });
        const row = await tx.rubric.update({
          where: { id },
          data: {
            slug: input.slug,
            name: input.name,
            version: { increment: 1 },
            ...authorship(context.actor),
            criteria: { create: this.criteriaRows(input) },
          },
          include: rubricInclude,
        });
        await this.recordUpdate(tx, context.actor, "rubric", row.id, row.status, row.version);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    return { entity: toRubric(updated), changed: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Questions.

  async listQuestions(query: ContentListQuery): Promise<QuestionListResponse> {
    const rows = await this.prisma.question.findMany({
      where: {
        AND: [
          cursorWhere(query.cursor) ?? {},
          query.status ? { status: query.status } : {},
          query.type ? { type: query.type } : {},
          query.topic_id ? { topicId: query.topic_id } : {},
          query.role ? { roles: { has: query.role } } : {},
          query.level ? { levels: { has: query.level } } : {},
          this.questionSearch(query.q),
        ],
      },
      include: { topic: true, rubric: { select: { slug: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    });
    const page = paginate(rows, query.limit);
    return { items: page.items.map(toQuestionListItem), next_cursor: page.next_cursor };
  }

  async getQuestion(id: string): Promise<Question> {
    return toQuestion(await this.findQuestionOrFail(id));
  }

  async createQuestion(actor: Actor, input: QuestionInput): Promise<Question> {
    const question = await this.prisma
      .$transaction(async (tx) => {
        const row = await tx.question.create({
          data: { ...this.questionRow(input), createdByUserId: actor.id, ...authorship(actor) },
          include: questionInclude,
        });
        await this.recordCreation(actor, "question", row.id, row.status, tx);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topic_id"));
    return toQuestion(question);
  }

  async updateQuestion(
    id: string,
    input: QuestionInput,
    context: ChangeContext,
  ): Promise<{ entity: Question; changed: boolean }> {
    const current = await this.findQuestionOrFail(id);
    if (sameContent(questionContent(current), input)) {
      return { entity: toQuestion(current), changed: false };
    }
    const updated = await this.prisma
      .$transaction(async (tx) => {
        await this.writeSnapshot(tx, "question", current, questionContent(current), context);
        const row = await tx.question.update({
          where: { id },
          data: {
            ...this.questionRow(input),
            version: { increment: 1 },
            ...authorship(context.actor),
          },
          include: questionInclude,
        });
        await this.recordUpdate(tx, context.actor, "question", row.id, row.status, row.version);
        return row;
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topic_id"));

    // A published question whose wording changed has a stale vector, and a stale vector is worse
    // than none: it answers duplicate searches with text nobody wrote (ADR-0006).
    const textChanged =
      QuestionEmbeddingsService.textFor(current) !== QuestionEmbeddingsService.textFor(updated);
    if (updated.status === "published" && textChanged) await this.embeddings.sync(updated);

    return { entity: toQuestion(updated), changed: true };
  }

  // ---------------------------------------------------------------------------------------------
  // The workflow: draft → in_review → published → retired.

  /**
   * Applies `data` to one publishable entity **only if `where` still matches**, and returns the
   * row. The precondition belongs in the statement, not in a check before it: `loadForTransition`
   * reads outside the transaction, so two requests can both see the same status. Without the
   * guard they both write, and the loser collides on `content_versions`' unique key — surfacing
   * as a misleading `track_already_published` for a question, or an uncoded 500.
   *
   * Returns null when the row moved under us, which every caller turns into its own 409.
   * (`apps/api/src/account/account-deletion.service.ts` uses the same shape.)
   */
  private async guardedUpdate(
    tx: Prisma.TransactionClient,
    entity: ContentEntityPath,
    where: { id: string; status?: ContentStatus; version?: number; aiDraftUnreviewed?: boolean },
    data: Prisma.QuestionUpdateManyMutationInput &
      Prisma.TrackUpdateManyMutationInput &
      Prisma.LessonUpdateManyMutationInput &
      Prisma.RubricUpdateManyMutationInput,
  ): Promise<{ id: string; status: ContentStatus; version: number; updatedAt: Date } | null> {
    const applied =
      entity === "tracks"
        ? await tx.track.updateMany({ where, data })
        : entity === "lessons"
          ? await tx.lesson.updateMany({ where, data })
          : entity === "questions"
            ? await tx.question.updateMany({ where, data })
            : await tx.rubric.updateMany({ where, data });
    if (applied.count === 0) return null;
    return entity === "tracks"
      ? await tx.track.findUniqueOrThrow({ where: { id: where.id } })
      : entity === "lessons"
        ? await tx.lesson.findUniqueOrThrow({ where: { id: where.id } })
        : entity === "questions"
          ? await tx.question.findUniqueOrThrow({ where: { id: where.id } })
          : await tx.rubric.findUniqueOrThrow({ where: { id: where.id } });
  }

  async transition(
    actor: Actor,
    entity: ContentEntityPath,
    id: string,
    body: ContentTransitionRequest,
  ): Promise<ContentTransitionResponse> {
    const current = await this.loadForTransition(entity, id);
    const check = checkTransition(body.transition, current.status, actor.role);
    if (!check.allowed) {
      throw check.because === "role"
        ? new ApiError(
            HttpStatus.FORBIDDEN,
            "content_transition_forbidden",
            `${body.transition} is for ${check.roles.join(" or ")}`,
          )
        : new ApiError(
            HttpStatus.CONFLICT,
            "content_transition_invalid",
            `${body.transition} applies to ${check.from.join(" or ")} content, not ${current.status}`,
          );
    }
    const to = check.rule.to;
    if (to === "published")
      await this.assertPublishable(entity, current, body.acknowledge_unreviewed);

    const context: ChangeContext = { actor, note: body.note };
    const updated = await this.prisma
      .$transaction(async (tx) => {
        // `published_at` is when it first reached candidates; retiring does not unsay that.
        const data = {
          status: to,
          version: { increment: 1 },
          ...(to === "published" ? { publishedAt: new Date() } : {}),
        };
        // The move goes first, guarded by the status and version it was decided against, so a
        // concurrent second transition loses here rather than on the snapshot's unique key.
        const row = await this.guardedUpdate(
          tx,
          entity,
          { id, status: current.status, version: current.version },
          data,
        );
        if (!row) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            "content_transition_invalid",
            "this content changed while the move was being made",
          );
        }
        // A transition is a change to the entity's state, so it is versioned like any other.
        await this.writeSnapshot(tx, ENTITY_TYPE[entity], current, current.content, context);
        await this.audit.record(
          {
            actorType: actorType(actor),
            actorId: actor.id,
            action: `content.${ENTITY_TYPE[entity]}.${check.rule.verb}`,
            targetType: ENTITY_TYPE[entity],
            targetId: id,
            before: { status: current.status, version: current.version },
            after: {
              status: row.status,
              version: row.version,
              /*
               * Recorded only when an admin actually reached for the override on something that
               * was actually marked — not merely whenever a marked item is published. Outside
               * production the guard never runs, so publishing a seeded draft there overrides
               * nothing, and an audit entry saying otherwise would be a lie that a later search
               * for real overrides would trip over.
               */
              ...(to === "published" && current.aiDraftUnreviewed && body.acknowledge_unreviewed
                ? { acknowledged_unreviewed: true }
                : {}),
            },
          },
          tx,
        );
        return row;
      })
      .catch((error: unknown) => {
        // The only unique constraint a status change can break: the partial index that allows one
        // published track per role and level.
        if (isPrismaError(error, "P2002")) {
          throw new ApiError(
            HttpStatus.CONFLICT,
            "track_already_published",
            "another track is already published for this role and level",
          );
        }
        throw error;
      });
    // Publishing a question embeds it and reports near-duplicates. A warning, never a refusal:
    // the publish has already happened, and a human decides what to do about the resemblance.
    const duplicates =
      entity === "questions" && to === "published"
        ? await this.embeddings.sync(await this.findQuestionOrFail(id))
        : [];

    return {
      entity,
      id: updated.id,
      status: updated.status,
      version: updated.version,
      updated_at: updated.updatedAt.toISOString(),
      duplicates,
    };
  }

  /**
   * Records that a person has read a model's draft and stands behind it (ADR-0014 decision 6).
   *
   * Deliberately its own action rather than a side effect of saving an edit: clearing the mark on
   * a save would mean a draft that needed no changes had to be edited to be approved, and a
   * one-word typo fix counted as reviewing the whole question and its rubric.
   *
   * It is versioned and audited like a transition — the version row carries who and when — but it
   * refuses when there is nothing to review, so a second click never churns the history.
   */
  async markReviewed(
    actor: Actor,
    entity: ContentEntityPath,
    id: string,
    body: ContentReviewRequest,
  ): Promise<ContentReviewResponse> {
    const current = await this.loadForTransition(entity, id);
    if (!current.aiDraftUnreviewed) throw this.notUnreviewed();

    const context: ChangeContext = { actor, note: body.note ?? REVIEW_NOTE };
    const reviewedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      // Guarded on the mark itself, so a double-click loses here and gets the same honest 409 as
      // a second click a minute later, rather than colliding on the version history's unique key.
      const row = await this.guardedUpdate(
        tx,
        entity,
        { id, aiDraftUnreviewed: true },
        {
          aiDraftUnreviewed: false,
          reviewedAt,
          reviewedByUserId: actor.id,
          version: { increment: 1 },
        },
      );
      if (!row) throw this.notUnreviewed();
      await this.writeSnapshot(tx, ENTITY_TYPE[entity], current, current.content, context);
      await this.audit.record(
        {
          actorType: actorType(actor),
          actorId: actor.id,
          action: `content.${ENTITY_TYPE[entity]}.reviewed`,
          targetType: ENTITY_TYPE[entity],
          targetId: id,
          before: { status: current.status, version: current.version, ai_draft_unreviewed: true },
          after: { status: row.status, version: row.version, ai_draft_unreviewed: false },
        },
        tx,
      );
      return row;
    });

    return {
      entity,
      id: updated.id,
      ai_draft_unreviewed: false,
      reviewed_at: reviewedAt.toISOString(),
      version: updated.version,
      updated_at: updated.updatedAt.toISOString(),
    };
  }

  /**
   * The seed file's `author` changed without its words changing (ADR-0014 decision 6).
   *
   * This is the case the whole YAML review round turns on: an expert reads a bank, approves most
   * of it **without rewriting a word**, sets `author: human` and re-imports. There is no content
   * change, so the importer's ordinary update path never runs and the mark would survive a review
   * that did happen.
   *
   * It is deliberately not an ordinary update. Nothing about the content moved, so writing a
   * version snapshot would put an entry in the history identical to the one before it and bump a
   * version number nothing could explain (decision 2). This is the one write that touches the
   * review columns alone — audited, because who vouched for what is exactly what the audit log is
   * for.
   *
   * Returns whether the mark changed, so the importer can report it; `dryRun` answers the same
   * question without writing.
   */
  async syncSeedReviewState(
    actor: Actor,
    entity: ContentEntityPath,
    id: string,
    dryRun = false,
  ): Promise<boolean> {
    const { seedManaged: _owned, ...review } = authorship(actor);
    // Only the seed importer claims anything about authorship; a CMS write says nothing.
    if (review.aiDraftUnreviewed === undefined) return false;
    const current = await this.loadForTransition(entity, id);
    if (current.aiDraftUnreviewed === review.aiDraftUnreviewed) return false;
    if (dryRun) return true;

    const marked = review.aiDraftUnreviewed;
    await this.prisma.$transaction(async (tx) => {
      const where = { id };
      if (entity === "tracks") await tx.track.update({ where, data: review });
      else if (entity === "lessons") await tx.lesson.update({ where, data: review });
      else if (entity === "questions") await tx.question.update({ where, data: review });
      else await tx.rubric.update({ where, data: review });
      await this.audit.record(
        {
          actorType: actorType(actor),
          actorId: actor.id,
          action: `content.${ENTITY_TYPE[entity]}.${marked ? "unreviewed" : "reviewed"}`,
          targetType: ENTITY_TYPE[entity],
          targetId: id,
          before: { ai_draft_unreviewed: current.aiDraftUnreviewed },
          after: { ai_draft_unreviewed: marked, by: "seed" },
        },
        tx,
      );
    });
    return true;
  }

  /** Near-duplicates of a question that may not exist yet (the CMS's question form). */
  duplicateCheck(request: DuplicateCheckRequest): Promise<DuplicateMatch[]> {
    return this.embeddings.check(request);
  }

  /** The rules that must hold before content reaches a candidate (ADR-0014 decision 1). */
  private async assertPublishable(
    entity: ContentEntityPath,
    current: TransitionTarget,
    acknowledgedUnreviewed: boolean,
  ): Promise<void> {
    /*
     * Nothing a model drafted reaches candidates in production until a person has said it is fit
     * to (ADR-0014 decision 6, CLAUDE.md §7.7). Development, test and the e2e run never refuse:
     * M3 is built against the seeded drafts, and a guard that blocked that would be turned off.
     *
     * The override is an admin's, not an expert's — only an admin can publish at all, so reaching
     * this line already means the actor had that authority. `transition` records in the audit
     * entry that it was used.
     */
    if (publishNeedsReview(this.env.NODE_ENV, current.aiDraftUnreviewed, acknowledgedUnreviewed)) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "content_unreviewed_ai_draft",
        "a model drafted this and no one has marked it reviewed",
      );
    }
    if (entity === "rubrics") {
      const rubric = await this.findRubricOrFail(current.id);
      if (!weightsTotalCorrectly(rubric.criteria)) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "rubric_weights_invalid",
          "criterion weights must add up to 100 before a rubric can be published",
        );
      }
    }
    if (entity === "questions") {
      const question = await this.findQuestionOrFail(current.id);
      if (question.rubric.status !== "published") {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "question_rubric_not_published",
          "publish the question's rubric first",
        );
      }
    }
    if (entity === "tracks") {
      const track = await this.findTrackOrFail(current.id);
      if (track.modules.length === 0) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "track_has_no_modules",
          "a track needs at least one module before it can be published",
        );
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Version history.

  async listVersions(entity: ContentEntityPath, id: string): Promise<ContentVersionsResponse> {
    await this.assertEntityExists(entity, id);
    const versions = await this.prisma.contentVersion.findMany({
      where: { entityType: ENTITY_TYPE[entity], entityId: id },
      orderBy: { version: "desc" },
      select: { version: true, changeNote: true, createdAt: true },
    });
    return {
      versions: versions.map((version) => ({
        version: version.version,
        change_note: version.changeNote,
        created_at: version.createdAt.toISOString(),
      })),
    };
  }

  async getVersion(
    entity: ContentEntityPath,
    id: string,
    version: number,
  ): Promise<ContentVersionResponse> {
    const row = await this.prisma.contentVersion.findUnique({
      where: {
        entityType_entityId_version: { entityType: ENTITY_TYPE[entity], entityId: id, version },
      },
    });
    if (!row) throw this.notFound("content_version_not_found");
    return {
      entity_type: row.entityType,
      entity_id: row.entityId,
      version: row.version,
      change_note: row.changeNote,
      created_at: row.createdAt.toISOString(),
      snapshot: (row.snapshot ?? {}) as Record<string, unknown>,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Candidate reads. Published only, and never the answer key.

  async candidateTrack(
    user: AuthenticatedUser,
    query: CandidateTrackQuery,
  ): Promise<CandidateTrackResponse> {
    const { role, level } = await this.audience(user.id, query);
    const track = await this.prisma.track.findFirst({
      where: { role, level, status: "published" },
      include: {
        topics: { orderBy: { topicId: "asc" } },
        modules: {
          orderBy: [{ position: "asc" }, { slug: "asc" }],
          // A lesson reaches a candidate only when the lesson and its track are both published.
          include: {
            lessons: {
              where: { status: "published" },
              orderBy: [{ position: "asc" }, { slug: "asc" }],
            },
          },
        },
      },
    });
    if (!track) throw this.notFound("track_not_found");
    return toCandidateTrack(track);
  }

  async candidateLesson(slug: string): Promise<CandidateLessonResponse> {
    const lesson = await this.prisma.lesson.findFirst({
      where: { slug, status: "published", module: { track: { status: "published" } } },
      include: { topic: true },
    });
    if (!lesson) throw this.notFound("lesson_not_found");
    return toCandidateLesson(lesson);
  }

  async candidatePractice(
    user: AuthenticatedUser,
    query: CandidatePracticeQuery,
  ): Promise<CandidatePracticeResponse> {
    const { role, level } = await this.audience(user.id, {});
    const questions = await this.prisma.question.findMany({
      where: {
        status: "published",
        // A question is only as published as its rubric: without one, M4 cannot score the answer.
        rubric: { status: "published" },
        roles: { has: role },
        levels: { has: level },
        ...(query.topic ? { topic: { slug: query.topic } } : {}),
      },
      include: { topic: true },
      orderBy: [{ difficulty: "asc" }, { slug: "asc" }],
      take: query.limit,
    });
    return { items: questions.map(toCandidatePracticeItem) };
  }

  /** Whose content to show: what was asked for, else what the candidate's profile says. */
  private async audience(
    userId: string,
    query: CandidateTrackQuery,
  ): Promise<{ role: TargetRole; level: ExperienceLevel }> {
    if (query.role && query.level) return { role: query.role, level: query.level };
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const role = query.role ?? profile?.targetRole;
    const level = query.level ?? profile?.level;
    if (!role || !level) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "profile_required",
        "finish onboarding, or ask for a role and level",
      );
    }
    return { role, level };
  }

  // ---------------------------------------------------------------------------------------------
  // Shared internals.

  private criteriaRows(input: RubricInput) {
    return input.criteria.map((criterion, position) => ({
      dimension: criterion.dimension,
      description: criterion.description,
      weight: criterion.weight,
      levels: criterion.levels,
      position,
    }));
  }

  private questionRow(input: QuestionInput) {
    return {
      slug: input.slug,
      roles: input.roles,
      levels: input.levels,
      type: input.type,
      topicId: input.topic_id,
      subtopic: input.subtopic,
      difficulty: input.difficulty,
      prompt: input.prompt,
      context: input.context,
      rubricId: input.rubric_id,
      idealPoints: input.ideal_points,
    };
  }

  // Free-text search, without regard to case, over the two columns that identify each row. One
  // helper per entity rather than one built from column names: Prisma's where types are the check
  // that a column exists, and a string array throws that away.
  private trackSearch(q: string | undefined): Prisma.TrackWhereInput {
    return q ? { OR: [{ slug: contains(q) }, { title: contains(q) }] } : {};
  }

  private lessonSearch(q: string | undefined): Prisma.LessonWhereInput {
    return q ? { OR: [{ slug: contains(q) }, { title: contains(q) }] } : {};
  }

  private rubricSearch(q: string | undefined): Prisma.RubricWhereInput {
    return q ? { OR: [{ slug: contains(q) }, { name: contains(q) }] } : {};
  }

  /** A question has no title; its prompt is what a searcher remembers. */
  private questionSearch(q: string | undefined): Prisma.QuestionWhereInput {
    return q ? { OR: [{ slug: contains(q) }, { prompt: contains(q) }] } : {};
  }

  /**
   * Stores the entity as it stands, under the version it is leaving behind. The snapshot carries
   * its `status` as well as its content: for a transition, the status *is* what changed.
   */
  private async writeSnapshot(
    tx: Prisma.TransactionClient,
    entityType: ContentEntityType,
    entity: { id: string; version: number; status: ContentStatus },
    content: unknown,
    context: ChangeContext,
  ): Promise<void> {
    await tx.contentVersion.create({
      data: {
        entityType,
        entityId: entity.id,
        version: entity.version,
        snapshot: { ...(content as Record<string, unknown>), status: entity.status },
        changedByUserId: context.actor.id,
        changeNote: context.note ?? null,
      },
    });
  }

  private async recordCreation(
    actor: Actor,
    entityType: ContentEntityType,
    id: string,
    status: ContentStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.audit.record(
      {
        actorType: actorType(actor),
        actorId: actor.id,
        action: `content.${entityType}.created`,
        targetType: entityType,
        targetId: id,
        after: { status, version: 1 },
      },
      tx,
    );
  }

  private async recordUpdate(
    tx: Prisma.TransactionClient,
    actor: Actor,
    entityType: ContentEntityType,
    id: string,
    status: ContentStatus,
    version: number,
  ): Promise<void> {
    // Status and version only: the audit table outlives the content and holds no prose (ADR-0011).
    await this.audit.record(
      {
        actorType: actorType(actor),
        actorId: actor.id,
        action: `content.${entityType}.updated`,
        targetType: entityType,
        targetId: id,
        before: { status, version: version - 1 },
        after: { status, version },
      },
      tx,
    );
  }

  private notUnreviewed(): ApiError {
    return new ApiError(
      HttpStatus.CONFLICT,
      "content_not_unreviewed",
      "this item is not an unreviewed AI draft",
    );
  }

  private notFound(code: string): ApiError {
    return new ApiError(HttpStatus.NOT_FOUND, code, "no such content");
  }

  /**
   * Turns the database's refusals into answers the CMS can act on: a slug already taken is a
   * conflict, a reference to something that is not there is a field error.
   */
  private rethrowWriteError(error: unknown, referenceField?: string): never {
    if (isPrismaError(error, "P2002")) {
      throw new ApiError(HttpStatus.CONFLICT, "content_slug_taken", "that slug is already in use");
    }
    if (isPrismaError(error, "P2003") && referenceField) {
      throw fieldError(referenceField, "no such topic or rubric");
    }
    throw error;
  }

  private async findTopicOrFail(id: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) throw this.notFound("topic_not_found");
    return topic;
  }

  private async findTrackOrFail(id: string): Promise<TrackRow> {
    const track = await this.prisma.track.findUnique({ where: { id }, include: trackInclude });
    if (!track) throw this.notFound("track_not_found");
    return track;
  }

  private async findLessonOrFail(id: string): Promise<LessonRow> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw this.notFound("lesson_not_found");
    return lesson;
  }

  private async findRubricOrFail(id: string): Promise<RubricRow> {
    const rubric = await this.prisma.rubric.findUnique({ where: { id }, include: rubricInclude });
    if (!rubric) throw this.notFound("rubric_not_found");
    return rubric;
  }

  private async findQuestionOrFail(id: string): Promise<QuestionRow> {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: questionInclude,
    });
    if (!question) throw this.notFound("question_not_found");
    return question;
  }

  private async assertEntityExists(entity: ContentEntityPath, id: string): Promise<void> {
    await this.loadForTransition(entity, id);
  }

  /** The entity as the workflow sees it: its status, its version, and the content to snapshot. */
  private async loadForTransition(
    entity: ContentEntityPath,
    id: string,
  ): Promise<TransitionTarget> {
    switch (entity) {
      case "tracks": {
        const row = await this.findTrackOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
          aiDraftUnreviewed: row.aiDraftUnreviewed,
          content: trackContent(row),
        };
      }
      case "lessons": {
        const row = await this.findLessonOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
          aiDraftUnreviewed: row.aiDraftUnreviewed,
          content: lessonContent(row),
        };
      }
      case "questions": {
        const row = await this.findQuestionOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
          aiDraftUnreviewed: row.aiDraftUnreviewed,
          content: questionContent(row),
        };
      }
      case "rubrics": {
        const row = await this.findRubricOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
          aiDraftUnreviewed: row.aiDraftUnreviewed,
          content: rubricContent(row),
        };
      }
    }
  }
}

interface TransitionTarget {
  id: string;
  status: ContentStatus;
  version: number;
  content: unknown;
  /** ADR-0014 decision 6: a model drafted this and nobody has vouched for it yet. */
  aiDraftUnreviewed: boolean;
}

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  type CandidateLessonResponse,
  type CandidatePracticeQuery,
  type CandidatePracticeResponse,
  type CandidateTrackQuery,
  type CandidateTrackResponse,
  type ContentEntityPath,
  type ContentEntityType,
  type ContentListQuery,
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
import { Prisma } from "../generated/prisma/client";
import { ApiError, fieldError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { cursorWhere, paginate } from "./content-cursor";
import { sameContent } from "./content-diff";
import { checkTransition } from "./content-workflow";
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
 * Three rules hold this file together:
 *
 * 1. **Candidates see published content only**, and never the answer key. The candidate reads at
 *    the bottom select what they need and map it with the `toCandidate*` mappers, which have no
 *    field a rubric could travel in. `content-no-answer-key.int.spec.ts` proves it over raw JSON.
 * 2. **Every mutation is one transaction**: the row, its version snapshot and its audit entry
 *    land together or not at all.
 * 3. **A snapshot is written only when the content actually changed.** Saving a form twice, or
 *    running the seed importer twice, leaves no trail of identical versions.
 */

const ENTITY_TYPE: Readonly<Record<ContentEntityPath, ContentEntityType>> = {
  tracks: "track",
  lessons: "lesson",
  questions: "question",
  rubrics: "rubric",
};

const contains = (q: string) => ({ contains: q, mode: Prisma.QueryMode.insensitive });

const isPrismaError = (error: unknown, code: string): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

/**
 * Who is making a change. `id` is null for the seed importer and other CLIs: they act as the
 * system, so the audit row says `system` and the authorship column stays empty rather than
 * pointing at whichever admin happened to run the command.
 */
export interface Actor {
  id: string | null;
  role: AuthenticatedUser["role"];
}

/** The importer and the CLIs. An admin's authority, nobody's name. */
export const SYSTEM_ACTOR: Actor = { id: null, role: "admin" };

const actorType = (actor: Actor) => (actor.id ? "admin" : "system");

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
  ) {}

  // ---------------------------------------------------------------------------------------------
  // Topics. A small curated taxonomy: no status, no history, no paging.

  async listTopics(): Promise<TopicsResponse> {
    const topics = await this.prisma.topic.findMany({ orderBy: { slug: "asc" } });
    return { topics: topics.map(toTopic) };
  }

  async createTopic(actor: Actor, input: TopicInput): Promise<Topic> {
    const topic = await this.prisma.topic
      .create({ data: { slug: input.slug, name: input.name, description: input.description } })
      .catch((error: unknown) => this.rethrowWriteError(error));
    await this.audit.record({
      actorType: actorType(actor),
      actorId: actor.id,
      action: "content.topic.created",
      targetType: "topic",
      targetId: topic.id,
    });
    return toTopic(topic);
  }

  async updateTopic(actor: Actor, id: string, input: TopicInput): Promise<Topic> {
    await this.findTopicOrFail(id);
    const topic = await this.prisma.topic
      .update({
        where: { id },
        data: { slug: input.slug, name: input.name, description: input.description },
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    await this.audit.record({
      actorType: actorType(actor),
      actorId: actor.id,
      action: "content.topic.updated",
      targetType: "topic",
      targetId: topic.id,
    });
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
    const track = await this.prisma.track
      .create({
        data: {
          slug: input.slug,
          role: input.role,
          level: input.level,
          title: input.title,
          summary: input.summary,
          createdByUserId: actor.id,
          topics: {
            create: sortTopics(input.topics).map((link) => ({
              topicId: link.topic_id,
              isCore: link.is_core,
            })),
          },
        },
        include: trackInclude,
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topics"));
    await this.recordCreation(actor, "track", track.id, track.status);
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
          data: {
            trackId,
            slug: input.slug,
            title: input.title,
            summary: input.summary,
            position: input.position,
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
    const lesson = await this.prisma.lesson
      .create({
        data: {
          moduleId,
          slug: input.slug,
          title: input.title,
          body: input.body,
          topicId: input.topic_id,
          position: input.position,
          estimatedMinutes: input.estimated_minutes,
          createdByUserId: actor.id,
        },
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topic_id"));
    await this.recordCreation(actor, "lesson", lesson.id, lesson.status);
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
    const rubric = await this.prisma.rubric
      .create({
        data: {
          slug: input.slug,
          name: input.name,
          createdByUserId: actor.id,
          criteria: { create: this.criteriaRows(input) },
        },
        include: rubricInclude,
      })
      .catch((error: unknown) => this.rethrowWriteError(error));
    await this.recordCreation(actor, "rubric", rubric.id, rubric.status);
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
    const question = await this.prisma.question
      .create({
        data: { ...this.questionRow(input), createdByUserId: actor.id },
        include: questionInclude,
      })
      .catch((error: unknown) => this.rethrowWriteError(error, "topic_id"));
    await this.recordCreation(actor, "question", question.id, question.status);
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
          data: { ...this.questionRow(input), version: { increment: 1 } },
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
    if (to === "published") await this.assertPublishable(entity, current);

    const context: ChangeContext = { actor, note: body.note };
    const updated = await this.prisma
      .$transaction(async (tx) => {
        // A transition is a change to the entity's state, so it is versioned like any other.
        await this.writeSnapshot(tx, ENTITY_TYPE[entity], current, current.content, context);
        // `published_at` is when it first reached candidates; retiring does not unsay that.
        const data = {
          status: to,
          version: { increment: 1 },
          ...(to === "published" ? { publishedAt: new Date() } : {}),
        };
        const row =
          entity === "tracks"
            ? await tx.track.update({ where: { id }, data })
            : entity === "lessons"
              ? await tx.lesson.update({ where: { id }, data })
              : entity === "questions"
                ? await tx.question.update({ where: { id }, data })
                : await tx.rubric.update({ where: { id }, data });
        await this.audit.record(
          {
            actorType: actorType(actor),
            actorId: actor.id,
            action: `content.${ENTITY_TYPE[entity]}.${check.rule.verb}`,
            targetType: ENTITY_TYPE[entity],
            targetId: id,
            before: { status: current.status, version: current.version },
            after: { status: row.status, version: row.version },
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

  /** Near-duplicates of a question that may not exist yet (the CMS's question form). */
  duplicateCheck(request: DuplicateCheckRequest): Promise<DuplicateMatch[]> {
    return this.embeddings.check(request);
  }

  /** The rules that must hold before content reaches a candidate (ADR-0014 decision 1). */
  private async assertPublishable(
    entity: ContentEntityPath,
    current: TransitionTarget,
  ): Promise<void> {
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
  ): Promise<void> {
    await this.audit.record({
      actorType: actorType(actor),
      actorId: actor.id,
      action: `content.${entityType}.created`,
      targetType: entityType,
      targetId: id,
      after: { status, version: 1 },
    });
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
        return { id: row.id, status: row.status, version: row.version, content: trackContent(row) };
      }
      case "lessons": {
        const row = await this.findLessonOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
          content: lessonContent(row),
        };
      }
      case "questions": {
        const row = await this.findQuestionOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
          content: questionContent(row),
        };
      }
      case "rubrics": {
        const row = await this.findRubricOrFail(id);
        return {
          id: row.id,
          status: row.status,
          version: row.version,
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
}

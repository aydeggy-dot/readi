import type {
  LessonInput,
  ModuleInput,
  QuestionInput,
  RubricInput,
  SeedFile,
  SeedQuestion,
  SeedTrack,
  TopicInput,
} from "@readi/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { sameContent } from "./content-diff";
import { ContentService, SYSTEM_ACTOR } from "./content.service";
import type { LoadedSeedFile } from "./seed-loader";

/**
 * Importing `/content/seed` into the database (spec §4.2).
 *
 * Two rules shape it:
 *
 * - **It writes through `ContentService`**, exactly as the CMS does, so a seeded change produces
 *   the same version snapshot and the same audit row as a change made by a person — as the system,
 *   with no name attached (`SYSTEM_ACTOR`).
 * - **It is idempotent.** An item whose content has not changed is not written at all, so running
 *   `pnpm db:seed` twice leaves no second version, no audit row and no new timestamp. That is the
 *   milestone's acceptance criterion, and it is also what makes the importer safe to re-run after
 *   an expert edits one question in a file of forty.
 *
 * It never deletes and never publishes: content removed from a file stays in the database (a
 * person may have edited it since), and everything it writes is a draft.
 */

export interface SeedCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export type SeedEntityKind = "topics" | "rubrics" | "questions" | "tracks" | "modules" | "lessons";

export type SeedReport = Record<SeedEntityKind, SeedCounts>;

/** Something a file refers to that no file defines: a topic slug with a typo, usually. */
export class SeedReferenceError extends Error {
  override name = "SeedReferenceError";
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(message);
  }
}

const emptyCounts = (): SeedCounts => ({ created: 0, updated: 0, unchanged: 0 });

const emptyReport = (): SeedReport => ({
  topics: emptyCounts(),
  rubrics: emptyCounts(),
  questions: emptyCounts(),
  tracks: emptyCounts(),
  modules: emptyCounts(),
  lessons: emptyCounts(),
});

/**
 * Stands in for an id a dry run cannot know: the row would be created by a real run, so there is
 * no uuid yet. It never reaches the database, because a dry run writes nothing.
 */
const PENDING_ID = "00000000-0000-0000-0000-000000000000";

export class SeedImporter {
  /** Slugs the files themselves define, so a dry run can tell "not yet created" from "a typo". */
  private readonly defined = { topics: new Set<string>(), rubrics: new Set<string>() };

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
    private readonly options: { dryRun: boolean } = { dryRun: false },
  ) {}

  /**
   * Imports every file, in dependency order rather than file order: topics before the questions
   * and lessons that name them, rubrics before their questions, tracks before their modules.
   */
  async import(files: readonly LoadedSeedFile[]): Promise<SeedReport> {
    const report = emptyReport();
    for (const { data } of files) {
      for (const topic of data.topics ?? []) this.defined.topics.add(topic.slug);
      for (const rubric of data.rubrics ?? []) this.defined.rubrics.add(rubric.slug);
    }
    for (const { data } of files) await this.importTopics(data, report);
    for (const { data } of files) await this.importRubrics(data, report);
    for (const { file, data } of files) await this.importQuestions(file, data, report);
    for (const { file, data } of files) await this.importTrack(file, data, report);
    return report;
  }

  // -------------------------------------------------------------------------------------------

  private async importTopics(data: SeedFile, report: SeedReport): Promise<void> {
    for (const topic of data.topics ?? []) {
      const input: TopicInput = {
        slug: topic.slug,
        name: topic.name,
        description: topic.description,
      };
      const existing = await this.prisma.topic.findUnique({ where: { slug: topic.slug } });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createTopic(SYSTEM_ACTOR, input);
        report.topics.created += 1;
        continue;
      }
      const current: TopicInput = {
        slug: existing.slug,
        name: existing.name,
        description: existing.description,
      };
      if (sameContent(current, input)) {
        report.topics.unchanged += 1;
        continue;
      }
      if (!this.options.dryRun) await this.content.updateTopic(SYSTEM_ACTOR, existing.id, input);
      report.topics.updated += 1;
    }
  }

  private async importRubrics(data: SeedFile, report: SeedReport): Promise<void> {
    for (const rubric of data.rubrics ?? []) {
      const input: RubricInput = {
        slug: rubric.slug,
        name: rubric.name,
        criteria: rubric.criteria,
      };
      const existing = await this.prisma.rubric.findUnique({ where: { slug: rubric.slug } });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createRubric(SYSTEM_ACTOR, input);
        report.rubrics.created += 1;
        continue;
      }
      await this.applyUpdate(
        report.rubrics,
        () => this.content.updateRubric(existing.id, input, { actor: SYSTEM_ACTOR, note }),
        async () => sameContent(await this.rubricContentOf(existing.id), input),
      );
    }
  }

  private async importQuestions(file: string, data: SeedFile, report: SeedReport): Promise<void> {
    for (const question of data.questions ?? []) {
      const input = await this.questionInput(file, question);
      const existing = await this.prisma.question.findUnique({ where: { slug: question.slug } });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createQuestion(SYSTEM_ACTOR, input);
        report.questions.created += 1;
        continue;
      }
      await this.applyUpdate(
        report.questions,
        () => this.content.updateQuestion(existing.id, input, { actor: SYSTEM_ACTOR, note }),
        () =>
          Promise.resolve(
            sameContent(
              {
                slug: existing.slug,
                roles: existing.roles,
                levels: existing.levels,
                type: existing.type,
                topic_id: existing.topicId,
                subtopic: existing.subtopic,
                difficulty: existing.difficulty,
                prompt: existing.prompt,
                context: existing.context,
                rubric_id: existing.rubricId,
                ideal_points: existing.idealPoints,
              },
              input,
            ),
          ),
      );
    }
  }

  private async importTrack(file: string, data: SeedFile, report: SeedReport): Promise<void> {
    const track = data.track;
    if (!track) return;
    const trackId = await this.upsertTrack(file, track, report);
    if (!trackId) {
      // A dry run that would create the track: nothing under it can exist yet either, so the plan
      // is complete without asking the database about rows that could not be there.
      for (const module of track.modules) {
        report.modules.created += 1;
        report.lessons.created += module.lessons.length;
      }
      return;
    }

    for (const [position, module] of track.modules.entries()) {
      const input: ModuleInput = {
        slug: module.slug,
        title: module.title,
        summary: module.summary,
        position,
      };
      const existing = await this.prisma.module.findUnique({
        where: { trackId_slug: { trackId, slug: module.slug } },
      });
      let moduleId = existing?.id;
      if (!existing) {
        report.modules.created += 1;
        if (!this.options.dryRun) {
          moduleId = (
            await this.content.createModule(trackId, input, { actor: SYSTEM_ACTOR, note })
          ).id;
        }
      } else if (
        sameContent(
          {
            slug: existing.slug,
            title: existing.title,
            summary: existing.summary,
            position: existing.position,
          },
          input,
        )
      ) {
        report.modules.unchanged += 1;
      } else {
        report.modules.updated += 1;
        if (!this.options.dryRun) {
          await this.content.updateModule(existing.id, input, { actor: SYSTEM_ACTOR, note });
        }
      }
      if (!moduleId) continue;

      for (const [lessonPosition, lesson] of module.lessons.entries()) {
        const input: LessonInput = {
          slug: lesson.slug,
          title: lesson.title,
          body: lesson.body,
          topic_id: lesson.topic ? await this.topicId(file, lesson.topic) : null,
          position: lessonPosition,
          estimated_minutes: lesson.estimated_minutes,
        };
        const existing = await this.prisma.lesson.findUnique({ where: { slug: lesson.slug } });
        if (!existing) {
          if (!this.options.dryRun) {
            await this.content.createLesson(SYSTEM_ACTOR, moduleId, input);
          }
          report.lessons.created += 1;
          continue;
        }
        await this.applyUpdate(
          report.lessons,
          () => this.content.updateLesson(existing.id, input, { actor: SYSTEM_ACTOR, note }),
          () =>
            Promise.resolve(
              sameContent(
                {
                  slug: existing.slug,
                  title: existing.title,
                  body: existing.body,
                  topic_id: existing.topicId,
                  position: existing.position,
                  estimated_minutes: existing.estimatedMinutes,
                },
                input,
              ),
            ),
        );
      }
    }
  }

  private async upsertTrack(
    file: string,
    track: SeedTrack,
    report: SeedReport,
  ): Promise<string | null> {
    const input = {
      slug: track.slug,
      role: track.role,
      level: track.level,
      title: track.title,
      summary: track.summary,
      topics: await Promise.all(
        track.topics.map(async (link) => ({
          topic_id: await this.topicId(file, link.topic),
          is_core: link.core,
        })),
      ),
    };
    const existing = await this.prisma.track.findUnique({
      where: { slug: track.slug },
      include: { topics: true },
    });
    if (!existing) {
      report.tracks.created += 1;
      if (this.options.dryRun) return null;
      return (await this.content.createTrack(SYSTEM_ACTOR, input)).id;
    }
    const current = {
      slug: existing.slug,
      role: existing.role,
      level: existing.level,
      title: existing.title,
      summary: existing.summary,
      topics: existing.topics.map((link) => ({ topic_id: link.topicId, is_core: link.isCore })),
    };
    if (sameContent(sortTopics(current), sortTopics(input))) report.tracks.unchanged += 1;
    else {
      report.tracks.updated += 1;
      if (!this.options.dryRun) {
        await this.content.updateTrack(existing.id, input, { actor: SYSTEM_ACTOR, note });
      }
    }
    return existing.id;
  }

  // -------------------------------------------------------------------------------------------

  /** Counts an update, and performs it unless this is a dry run. */
  private async applyUpdate(
    counts: SeedCounts,
    update: () => Promise<{ changed: boolean }>,
    unchanged: () => Promise<boolean>,
  ): Promise<void> {
    if (this.options.dryRun) {
      if (await unchanged()) counts.unchanged += 1;
      else counts.updated += 1;
      return;
    }
    // Outside a dry run the service decides: it compares the same content and answers `changed`.
    const result = await update();
    if (result.changed) counts.updated += 1;
    else counts.unchanged += 1;
  }

  private async questionInput(file: string, question: SeedQuestion): Promise<QuestionInput> {
    const rubric = await this.prisma.rubric.findUnique({ where: { slug: question.rubric } });
    const rubricId = rubric?.id ?? this.pending("rubrics", question.rubric);
    if (!rubricId) {
      throw new SeedReferenceError(
        file,
        `question ${question.slug} names rubric ${question.rubric}, which no seed file defines`,
      );
    }
    return {
      slug: question.slug,
      roles: question.roles,
      levels: question.levels,
      type: question.type,
      topic_id: await this.topicId(file, question.topic),
      subtopic: question.subtopic,
      difficulty: question.difficulty,
      prompt: question.prompt,
      context: question.context,
      rubric_id: rubricId,
      ideal_points: question.ideal_points,
    };
  }

  private async topicId(file: string, slug: string): Promise<string> {
    const topic = await this.prisma.topic.findUnique({ where: { slug } });
    const id = topic?.id ?? this.pending("topics", slug);
    if (!id)
      throw new SeedReferenceError(file, `topic ${slug} is used but no seed file defines it`);
    return id;
  }

  /**
   * A dry run resolves references to rows that do not exist yet — a topic this very run would
   * create — to a placeholder, so that it can report the whole plan instead of stopping at the
   * first forward reference. A slug no file defines still fails, in either mode.
   */
  private pending(kind: "topics" | "rubrics", slug: string): string | null {
    return this.options.dryRun && this.defined[kind].has(slug) ? PENDING_ID : null;
  }

  private async rubricContentOf(id: string): Promise<RubricInput> {
    const rubric = await this.prisma.rubric.findUniqueOrThrow({
      where: { id },
      include: { criteria: { orderBy: { position: "asc" } } },
    });
    return {
      slug: rubric.slug,
      name: rubric.name,
      criteria: rubric.criteria.map((criterion) => ({
        dimension: criterion.dimension,
        description: criterion.description,
        weight: criterion.weight,
        levels: criterion.levels as RubricInput["criteria"][number]["levels"],
      })),
    };
  }
}

/** The change note every seeded edit carries, so the history says where it came from. */
const note = "seed import";

const sortTopics = <T extends { topics: { topic_id: string; is_core: boolean }[] }>(
  value: T,
): T => ({
  ...value,
  topics: [...value.topics].sort((a, b) => (a.topic_id < b.topic_id ? -1 : 1)),
});

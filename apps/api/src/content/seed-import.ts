import type {
  LessonInput,
  ModuleInput,
  QuestionInput,
  RubricInput,
  SeedFile,
  SeedModule,
  SeedQuestion,
  SeedTrack,
  TopicInput,
} from "@readi/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { sameContent } from "./content-diff";
import { type Actor, ContentService, seedActor } from "./content.service";
import type { LoadedSeedFile } from "./seed-loader";

/**
 * Importing `/content/seed` into the database (spec §4.2).
 *
 * Three rules shape it:
 *
 * - **It writes through `ContentService`**, exactly as the CMS does, so a seeded change produces
 *   the same version snapshot and the same audit row as a change made by a person — as the system,
 *   with no name attached, carrying the file's `author` so the rows it writes say whether a
 *   person has vouched for them (ADR-0014 decisions 5 and 6).
 * - **It is idempotent.** An item whose content has not changed is not written at all, so running
 *   `pnpm db:seed` twice leaves no second version, no audit row and no new timestamp. That is the
 *   milestone's acceptance criterion.
 * - **The CMS wins.** The files create; once a person has edited an item in the CMS
 *   (`seed_managed = false`), the importer leaves it alone and names it, so a re-run from muscle
 *   memory cannot undo an expert's work. `--force` overwrites anyway and takes the item back for
 *   the files (ADR-0014 decision 5).
 *
 * It never deletes and never publishes: content removed from a file stays in the database (a
 * person may have edited it since), and everything it writes is a draft.
 */

export interface SeedCounts {
  created: number;
  updated: number;
  unchanged: number;
  /**
   * Items whose words did not change but whose file changed its mind about `author` — an expert's
   * YAML review round approving a bank as it stands (ADR-0014 decision 6). Counted apart from
   * `updated` because no content moved and no version was written.
   */
  reviewed: number;
  /**
   * Slugs the CMS owns now, left exactly as they are. Named rather than counted: "3 skipped" sends
   * a reader hunting, and the point of the report is to say what the files no longer control.
   */
  skipped: string[];
}

export type SeedEntityKind = "topics" | "rubrics" | "questions" | "tracks" | "modules" | "lessons";

export interface SeedOptions {
  /** Report the plan without writing anything. */
  dryRun?: boolean;
  /** Overwrite items the CMS owns, taking them back for the files (ADR-0014 decision 5). */
  force?: boolean;
}

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

const emptyCounts = (): SeedCounts => ({
  created: 0,
  updated: 0,
  unchanged: 0,
  reviewed: 0,
  skipped: [],
});

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
    private readonly options: SeedOptions = {},
  ) {}

  /**
   * The actor for the file being imported. It carries that file's `author`, which is what decides
   * whether the rows it writes are marked as unreviewed AI drafts (ADR-0014 decision 6) — so it
   * changes as the importer moves from one file to the next, and every write below uses it rather
   * than a shared constant.
   */
  private actor: Actor = seedActor("ai_draft");

  /** The note every seeded edit carries, so the history says where it came from. */
  private get note(): string {
    return this.options.force ? "seed import (forced)" : "seed import";
  }

  /**
   * What to do about a row that already exists, in one place for all six kinds of content.
   *
   * The order of the two questions matters. **Has it changed?** comes first, so a CMS-owned item
   * that happens to match its file is reported as unchanged rather than named in every future
   * run — the skipped list is for file changes that did not land, and a list that never empties
   * is a list nobody reads. **May we write it?** comes second: a row the CMS has taken over is
   * left exactly as it is and named, unless `--force` is passed, in which case the write goes
   * through `ContentService` as the seed actor and the row becomes the files' again
   * (ADR-0014 decision 5).
   */
  private async applyChange(
    counts: SeedCounts,
    slug: string,
    existing: { seedManaged: boolean },
    unchanged: () => Promise<boolean>,
    update: () => Promise<unknown>,
    /**
     * For the four entities that carry review state: reconcile the row's mark with the file's
     * `author` when nothing else changed. Omitted for topics and modules, which have no mark.
     */
    syncReview?: () => Promise<boolean>,
  ): Promise<void> {
    const mayWrite = existing.seedManaged || this.options.force === true;
    if (await unchanged()) {
      /*
       * The words are the same — but `author` is not part of the words, and it is a claim about
       * whether a person has vouched for them. An expert who reads a bank and approves most of it
       * without rewriting anything changes nothing but that line, and this is the only place that
       * notices (ADR-0014 decision 6). It is not a content change, so it earns no version.
       */
      if (syncReview && mayWrite && (await syncReview())) counts.reviewed += 1;
      counts.unchanged += 1;
      return;
    }
    if (!mayWrite) {
      counts.skipped.push(slug);
      return;
    }
    counts.updated += 1;
    if (!this.options.dryRun) await update();
  }

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
    for (const { data } of files) await this.forFile(data, () => this.importTopics(data, report));
    for (const { data } of files) await this.forFile(data, () => this.importRubrics(data, report));
    for (const { file, data } of files)
      await this.forFile(data, () => this.importQuestions(file, data, report));
    for (const { file, data } of files)
      await this.forFile(data, () => this.importTrack(file, data, report));
    return report;
  }

  /** Runs one pass over one file with that file's authorship in force. */
  private async forFile(data: SeedFile, pass: () => Promise<void>): Promise<void> {
    this.actor = seedActor(data.author);
    await pass();
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
        if (!this.options.dryRun) await this.content.createTopic(this.actor, input);
        report.topics.created += 1;
        continue;
      }
      const current: TopicInput = {
        slug: existing.slug,
        name: existing.name,
        description: existing.description,
      };
      await this.applyChange(
        report.topics,
        topic.slug,
        existing,
        () => Promise.resolve(sameContent(current, input)),
        () => this.content.updateTopic(this.actor, existing.id, input),
      );
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
        if (!this.options.dryRun) await this.content.createRubric(this.actor, input);
        report.rubrics.created += 1;
        continue;
      }
      await this.applyChange(
        report.rubrics,
        rubric.slug,
        existing,
        async () => sameContent(await this.rubricContentOf(existing.id), input),
        () => this.content.updateRubric(existing.id, input, { actor: this.actor, note: this.note }),
        () =>
          this.content.syncSeedReviewState(
            this.actor,
            "rubrics",
            existing.id,
            this.options.dryRun === true,
          ),
      );
    }
  }

  private async importQuestions(file: string, data: SeedFile, report: SeedReport): Promise<void> {
    for (const question of data.questions ?? []) {
      const input = await this.questionInput(file, question);
      const existing = await this.prisma.question.findUnique({ where: { slug: question.slug } });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createQuestion(this.actor, input);
        report.questions.created += 1;
        continue;
      }
      const current: QuestionInput = {
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
      };
      await this.applyChange(
        report.questions,
        question.slug,
        existing,
        () => Promise.resolve(sameContent(current, input)),
        () =>
          this.content.updateQuestion(existing.id, input, { actor: this.actor, note: this.note }),
        () =>
          this.content.syncSeedReviewState(
            this.actor,
            "questions",
            existing.id,
            this.options.dryRun === true,
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
            await this.content.createModule(trackId, input, { actor: this.actor, note: this.note })
          ).id;
        }
      } else {
        const current: ModuleInput = {
          slug: existing.slug,
          title: existing.title,
          summary: existing.summary,
          position: existing.position,
        };
        await this.applyChange(
          report.modules,
          module.slug,
          existing,
          () => Promise.resolve(sameContent(current, input)),
          () =>
            this.content.updateModule(existing.id, input, { actor: this.actor, note: this.note }),
        );
      }
      // A module the CMS owns still has lessons the files may own, so they are considered either way.
      if (!moduleId) {
        /*
         * Only a dry run reaches here: the module does not exist yet, so nothing under it can
         * either, and its lessons all count as creations. Without this the plan a dry run prints
         * is not the plan a real run performs — it said `lessons: 0 to create` for a new module
         * added to a track that already existed.
         */
        report.lessons.created += module.lessons.length;
        continue;
      }
      await this.importLessons(file, module, moduleId, report);
    }
  }

  private async importLessons(
    file: string,
    module: SeedModule,
    moduleId: string,
    report: SeedReport,
  ): Promise<void> {
    for (const [position, lesson] of module.lessons.entries()) {
      const existing = await this.prisma.lesson.findUnique({ where: { slug: lesson.slug } });
      const input: LessonInput = {
        slug: lesson.slug,
        title: lesson.title,
        body: lesson.body,
        topic_id: lesson.topic ? await this.topicId(file, lesson.topic) : null,
        position,
        estimated_minutes: lesson.estimated_minutes,
      };
      if (!existing) {
        if (!this.options.dryRun) await this.content.createLesson(this.actor, moduleId, input);
        report.lessons.created += 1;
        continue;
      }
      const current: LessonInput = {
        slug: existing.slug,
        title: existing.title,
        body: existing.body,
        topic_id: existing.topicId,
        position: existing.position,
        estimated_minutes: existing.estimatedMinutes,
      };
      await this.applyChange(
        report.lessons,
        lesson.slug,
        existing,
        () => Promise.resolve(sameContent(current, input)),
        () => this.content.updateLesson(existing.id, input, { actor: this.actor, note: this.note }),
        () =>
          this.content.syncSeedReviewState(
            this.actor,
            "lessons",
            existing.id,
            this.options.dryRun === true,
          ),
      );
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
      return (await this.content.createTrack(this.actor, input)).id;
    }
    const current = {
      slug: existing.slug,
      role: existing.role,
      level: existing.level,
      title: existing.title,
      summary: existing.summary,
      topics: existing.topics.map((link) => ({ topic_id: link.topicId, is_core: link.isCore })),
    };
    await this.applyChange(
      report.tracks,
      track.slug,
      existing,
      () => Promise.resolve(sameContent(sortTopics(current), sortTopics(input))),
      () => this.content.updateTrack(existing.id, input, { actor: this.actor, note: this.note }),
      () =>
        this.content.syncSeedReviewState(
          this.actor,
          "tracks",
          existing.id,
          this.options.dryRun === true,
        ),
    );
    return existing.id;
  }

  // -------------------------------------------------------------------------------------------

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

const sortTopics = <T extends { topics: { topic_id: string; is_core: boolean }[] }>(
  value: T,
): T => ({
  ...value,
  topics: [...value.topics].sort((a, b) => (a.topic_id < b.topic_id ? -1 : 1)),
});

import type {
  CareerLevelInput,
  CareerRoleInput,
  ContentStatus,
  LessonInput,
  ModuleInput,
  QuestionInput,
  RubricInput,
  SeedCareerRole,
  SeedFile,
  SeedModule,
  SeedQuestion,
  SeedTrack,
  StackInput,
  TopicInput,
} from "@readi/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { canonicalQuestionInput } from "./content.mappers";
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
  /**
   * Slugs that are **published** and whose file would have rewritten them. Left alone and named,
   * for the same reason an expert cannot edit published content in the CMS (ADR-0014 decision 7):
   * candidates are reading these words now, and changing them is an admin's deliberate act.
   * `--force` writes them anyway.
   */
  published: string[];
}

export type SeedEntityKind =
  | "career_levels"
  | "stacks"
  | "career_roles"
  | "topics"
  | "rubrics"
  | "questions"
  | "tracks"
  | "modules"
  | "lessons";

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
  published: [],
});

const emptyReport = (): SeedReport => ({
  // In import order: a role names levels and stacks, so they exist before it does.
  career_levels: emptyCounts(),
  stacks: emptyCounts(),
  career_roles: emptyCounts(),
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
  private readonly defined = {
    topics: new Set<string>(),
    rubrics: new Set<string>(),
    career_levels: new Set<string>(),
    career_roles: new Set<string>(),
    stacks: new Set<string>(),
  };

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
    existing: { seedManaged: boolean; status?: ContentStatus },
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
    /*
     * Published content is what candidates are reading right now, and a file rewriting it is the
     * same act as an expert rewriting it in the CMS — an admin's call (ADR-0014 decision 7). It is
     * also how model-drafted words could reach candidates without the publish guard ever running:
     * an import changes no status, so nothing passes `publishNeedsReview`.
     */
    if (existing.status === "published" && this.options.force !== true) {
      counts.published.push(slug);
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
      for (const level of data.career_levels ?? []) this.defined.career_levels.add(level.slug);
      for (const stack of data.stacks ?? []) this.defined.stacks.add(stack.slug);
      for (const role of data.career_roles ?? []) this.defined.career_roles.add(role.slug);
    }
    // The catalogue first: a role names the levels and stacks it offers (ADR-0015).
    for (const { data } of files)
      await this.forFile(data, () => this.importCareerLevels(data, report));
    for (const { data } of files) await this.forFile(data, () => this.importStacks(data, report));
    for (const { file, data } of files)
      await this.forFile(data, () => this.importCareerRoles(file, data, report));
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

  private async importCareerLevels(data: SeedFile, report: SeedReport): Promise<void> {
    for (const level of data.career_levels ?? []) {
      const input: CareerLevelInput = {
        slug: level.slug,
        name: level.name,
        summary: level.summary,
        rank: level.rank,
      };
      const existing = await this.prisma.careerLevel.findUnique({ where: { slug: level.slug } });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createCareerLevel(this.actor, input);
        report.career_levels.created += 1;
        continue;
      }
      const current: CareerLevelInput = {
        slug: existing.slug,
        name: existing.name,
        summary: existing.summary,
        rank: existing.rank,
      };
      await this.applyChange(
        report.career_levels,
        level.slug,
        existing,
        () => Promise.resolve(sameContent(current, input)),
        () =>
          this.content.updateCareerLevel(existing.id, input, {
            actor: this.actor,
            note: this.note,
          }),
        () =>
          this.content.syncSeedReviewState(
            this.actor,
            "career-levels",
            existing.id,
            this.options.dryRun === true,
          ),
      );
    }
  }

  private async importStacks(data: SeedFile, report: SeedReport): Promise<void> {
    for (const stack of data.stacks ?? []) {
      const input: StackInput = { slug: stack.slug, name: stack.name, summary: stack.summary };
      const existing = await this.prisma.stack.findUnique({ where: { slug: stack.slug } });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createStack(this.actor, input);
        report.stacks.created += 1;
        continue;
      }
      const current: StackInput = {
        slug: existing.slug,
        name: existing.name,
        summary: existing.summary,
      };
      await this.applyChange(
        report.stacks,
        stack.slug,
        existing,
        () => Promise.resolve(sameContent(current, input)),
        () => this.content.updateStack(existing.id, input, { actor: this.actor, note: this.note }),
        () =>
          this.content.syncSeedReviewState(
            this.actor,
            "stacks",
            existing.id,
            this.options.dryRun === true,
          ),
      );
    }
  }

  private async importCareerRoles(file: string, data: SeedFile, report: SeedReport): Promise<void> {
    for (const role of data.career_roles ?? []) {
      const input = await this.careerRoleInput(file, role);
      const existing = await this.prisma.careerRole.findUnique({
        where: { slug: role.slug },
        include: {
          levels: { orderBy: { position: "asc" } },
          stacks: { orderBy: { position: "asc" } },
        },
      });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createCareerRole(this.actor, input);
        report.career_roles.created += 1;
        continue;
      }
      const current: CareerRoleInput = {
        slug: existing.slug,
        name: existing.name,
        summary: existing.summary,
        position: existing.position,
        supported_question_types: existing.supportedQuestionTypes,
        levels: existing.levels.map((link) => link.levelId),
        stacks: existing.stacks.map((link) => ({
          stack_id: link.stackId,
          is_default: link.isDefault,
        })),
      };
      await this.applyChange(
        report.career_roles,
        role.slug,
        existing,
        () => Promise.resolve(sameContent(current, input)),
        () =>
          this.content.updateCareerRole(existing.id, input, {
            actor: this.actor,
            note: this.note,
          }),
        () =>
          this.content.syncSeedReviewState(
            this.actor,
            "career-roles",
            existing.id,
            this.options.dryRun === true,
          ),
      );
    }
  }

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
      const existing = await this.prisma.question.findUnique({
        where: { slug: question.slug },
        include: {
          roles: {
            orderBy: { role: { slug: "asc" } },
            include: { role: { select: { slug: true } } },
          },
          levels: {
            orderBy: { level: { slug: "asc" } },
            include: { level: { select: { slug: true } } },
          },
        },
      });
      if (!existing) {
        if (!this.options.dryRun) await this.content.createQuestion(this.actor, input);
        report.questions.created += 1;
        continue;
      }
      const current: QuestionInput = {
        slug: existing.slug,
        roles: existing.roles.map((link) => link.role.slug),
        levels: existing.levels.map((link) => link.level.slug),
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
        // Roles and levels are sets: a file listing them in a different order is not a change.
        () =>
          Promise.resolve(
            sameContent(canonicalQuestionInput(current), canonicalQuestionInput(input)),
          ),
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
      role: await this.catalogueSlug(file, "career_roles", track.role, `track ${track.slug}`),
      level: await this.catalogueSlug(file, "career_levels", track.level, `track ${track.slug}`),
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
      include: {
        topics: true,
        role: { select: { slug: true } },
        level: { select: { slug: true } },
      },
    });
    if (!existing) {
      report.tracks.created += 1;
      if (this.options.dryRun) return null;
      return (await this.content.createTrack(this.actor, input)).id;
    }
    const current = {
      slug: existing.slug,
      role: existing.role.slug,
      level: existing.level.slug,
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
      roles: await Promise.all(
        question.roles.map((slug) =>
          this.catalogueSlug(file, "career_roles", slug, `question ${question.slug}`),
        ),
      ),
      levels: await Promise.all(
        question.levels.map((slug) =>
          this.catalogueSlug(file, "career_levels", slug, `question ${question.slug}`),
        ),
      ),
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

  private async careerRoleInput(file: string, role: SeedCareerRole): Promise<CareerRoleInput> {
    return {
      slug: role.slug,
      name: role.name,
      summary: role.summary,
      position: role.position,
      supported_question_types: role.supported_question_types,
      levels: await Promise.all(role.levels.map((slug) => this.careerLevelId(file, role, slug))),
      stacks: await Promise.all(
        role.stacks.map(async (link) => ({
          stack_id: await this.stackId(file, role, link.stack),
          is_default: link.default,
        })),
      ),
    };
  }

  private async careerLevelId(file: string, role: SeedCareerRole, slug: string): Promise<string> {
    const level = await this.prisma.careerLevel.findUnique({ where: { slug } });
    const id = level?.id ?? this.pending("career_levels", slug);
    if (!id) {
      throw new SeedReferenceError(
        file,
        `role ${role.slug} names level ${slug}, which no seed file defines`,
      );
    }
    return id;
  }

  private async stackId(file: string, role: SeedCareerRole, slug: string): Promise<string> {
    const stack = await this.prisma.stack.findUnique({ where: { slug } });
    const id = stack?.id ?? this.pending("stacks", slug);
    if (!id) {
      throw new SeedReferenceError(
        file,
        `role ${role.slug} names stack ${slug}, which no seed file defines`,
      );
    }
    return id;
  }

  /**
   * Checks that a role or level slug is real and hands it straight back: unlike topics and
   * rubrics, the catalogue is passed to `ContentService` **by slug**, which resolves it itself
   * (ADR-0015). What is gained here is the error — `SeedReferenceError` names the file and the
   * question, where the service could only say `role_not_found` about a request it did not make.
   */
  private async catalogueSlug(
    file: string,
    kind: "career_roles" | "career_levels",
    slug: string,
    usedBy: string,
  ): Promise<string> {
    const found =
      kind === "career_roles"
        ? await this.prisma.careerRole.findUnique({ where: { slug }, select: { id: true } })
        : await this.prisma.careerLevel.findUnique({ where: { slug }, select: { id: true } });
    if (found || this.defined[kind].has(slug)) return slug;
    const noun = kind === "career_roles" ? "role" : "level";
    throw new SeedReferenceError(
      file,
      `${usedBy} names ${noun} ${slug}, which no seed file defines`,
    );
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
  private pending(kind: keyof SeedImporter["defined"], slug: string): string | null {
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

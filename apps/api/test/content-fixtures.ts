import { randomUUID } from "node:crypto";
import type { ExperienceLevel, TargetRole } from "@readi/shared-types";
import type { PrismaService } from "../src/prisma/prisma.service";

/**
 * Published content for the tests that read it back: a topic, a rubric with two criteria, a
 * question, and a track with one module and one lesson.
 *
 * Two things matter about the shape of this fixture:
 *
 * - **The answer key is really there.** Every ideal point, every criterion dimension and
 *   description, and all ten level descriptors carry a unique `ANSWERKEY-…` marker, and
 *   `answerKeyMarkers` lists them. A leak test over a fixture with nothing to leak proves nothing,
 *   so the marker list is also asserted to be non-empty and to be reachable through the admin API.
 * - **The visible content is distinctive too** (`visibleMarkers`), so a test can tell "no answer
 *   key leaked" apart from "the response was empty".
 *
 * At most one track may be published per (role, level) — a partial unique index (ADR-0014) — and
 * test files run in parallel against one database, so each spec file that publishes a track must
 * own its own pair:
 *
 * | pair                      | owner                                |
 * | ------------------------- | ------------------------------------ |
 * | (qa, intern_junior)       | `content-schema.int.spec.ts`         |
 * | (frontend, intern_junior) | `content-admin.int.spec.ts`          |
 * | (backend, mid)            | `content.int.spec.ts`                |
 * | (frontend, mid)           | `content-no-answer-key.int.spec.ts`  |
 *
 * `seedPublishedContent` clears its pair first, so a run interrupted halfway leaves no published
 * track behind to block the next one.
 */

export interface ContentFixture {
  topicId: string;
  topicSlug: string;
  rubricId: string;
  questionId: string;
  questionSlug: string;
  trackId: string;
  moduleId: string;
  lessonId: string;
  lessonSlug: string;
  role: TargetRole;
  level: ExperienceLevel;
  /** Strings that must never appear in a candidate-facing response. */
  answerKeyMarkers: string[];
  /** Strings a candidate is supposed to see, so an empty response cannot pass for a clean one. */
  visibleMarkers: { prompt: string; lessonBody: string; trackTitle: string };
}

export interface SeedOptions {
  role: TargetRole;
  level: ExperienceLevel;
  /** Defaults to published; pass a status to seed content at an earlier stage of the workflow. */
  status?: "draft" | "in_review" | "published" | "retired";
}

const marker = (what: string) => `ANSWERKEY-${what}-${randomUUID()}`;

export async function seedPublishedContent(
  prisma: PrismaService,
  options: SeedOptions,
): Promise<ContentFixture> {
  const { role, level } = options;
  const status = options.status ?? "published";
  const id = randomUUID().slice(0, 8);

  // This spec file owns this (role, level) pair; clear anything an interrupted run left behind.
  await prisma.track.deleteMany({ where: { role, level } });

  const idealPoints = [marker("ideal-1"), marker("ideal-2")];
  const criteria = [60, 40].map((weight, index) => ({
    dimension: marker(`dimension-${index}`),
    description: marker(`criterion-${index}`),
    weight,
    levels: Object.fromEntries(
      ["0", "1", "2", "3", "4"].map((band) => [band, marker(`level-${index}-${band}`)]),
    ),
    position: index,
  }));

  const prompt = `VISIBLE prompt ${id}: how would you make this page fast?`;
  const lessonBody = `# VISIBLE lesson ${id}\n\nMeasure before you change anything.`;
  const trackTitle = `VISIBLE track ${id}`;

  const topic = await prisma.topic.create({
    data: { slug: `fixture-topic-${id}`, name: `Fixture topic ${id}`, description: null },
  });

  const rubric = await prisma.rubric.create({
    data: {
      slug: `fixture-rubric-${id}`,
      name: marker("rubric-name"),
      status,
      criteria: { create: criteria },
    },
  });

  const question = await prisma.question.create({
    data: {
      slug: `fixture-question-${id}`,
      roles: [role],
      levels: [level],
      type: "technical",
      topicId: topic.id,
      subtopic: null,
      difficulty: 3,
      prompt,
      context: null,
      rubricId: rubric.id,
      idealPoints,
      status,
    },
  });

  const track = await prisma.track.create({
    data: {
      slug: `fixture-track-${id}`,
      role,
      level,
      title: trackTitle,
      summary: null,
      status,
      topics: { create: [{ topicId: topic.id, isCore: true }] },
      modules: {
        create: [
          {
            slug: `fixture-module-${id}`,
            title: `Fixture module ${id}`,
            summary: null,
            position: 0,
            lessons: {
              create: [
                {
                  slug: `fixture-lesson-${id}`,
                  title: `Fixture lesson ${id}`,
                  body: lessonBody,
                  topicId: topic.id,
                  position: 0,
                  estimatedMinutes: 10,
                  status,
                },
              ],
            },
          },
        ],
      },
    },
    include: { modules: { include: { lessons: true } } },
  });

  const module = track.modules[0];
  const lesson = module?.lessons[0];
  if (!module || !lesson) throw new Error("fixture did not create its module and lesson");

  return {
    topicId: topic.id,
    topicSlug: topic.slug,
    rubricId: rubric.id,
    questionId: question.id,
    questionSlug: question.slug,
    trackId: track.id,
    moduleId: module.id,
    lessonId: lesson.id,
    lessonSlug: lesson.slug,
    role,
    level,
    answerKeyMarkers: [
      ...idealPoints,
      ...criteria.flatMap((criterion) => [
        criterion.dimension,
        criterion.description,
        ...Object.values(criterion.levels),
      ]),
    ],
    visibleMarkers: { prompt, lessonBody, trackTitle },
  };
}

/** Removes everything `seedPublishedContent` created, in dependency order. */
export async function removeContent(prisma: PrismaService, fixture: ContentFixture): Promise<void> {
  await prisma.track.deleteMany({ where: { id: fixture.trackId } });
  await prisma.question.deleteMany({ where: { id: fixture.questionId } });
  await prisma.rubric.deleteMany({ where: { id: fixture.rubricId } });
  await prisma.topic.deleteMany({ where: { id: fixture.topicId } });
  await prisma.contentVersion.deleteMany({
    where: { entityId: { in: [fixture.trackId, fixture.questionId, fixture.rubricId] } },
  });
}

/** Gives a signed-in test user the profile the candidate reads default to. */
export async function giveProfile(
  prisma: PrismaService,
  email: string,
  role: TargetRole,
  level: ExperienceLevel,
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      targetRole: role,
      level,
      yearsExperience: 2,
      stack: ["TypeScript"],
      targetCompanyType: "local_startup",
      onboardingCompletedAt: new Date(),
    },
    update: { targetRole: role, level },
  });
  return user.id;
}

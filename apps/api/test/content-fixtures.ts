import { randomUUID } from "node:crypto";
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
 * test files run in parallel against one database. Until M2.5 phase 3 that meant a table of which
 * spec file owned which of the enum's six pairs, because there were only six to go round and four
 * were taken. **Roles and levels are content now**, so every fixture mints its own pair with
 * unique slugs (`seedCataloguePair`) and no spec can collide with another. The table is gone, and
 * so is the reason a new spec had to be added to it.
 *
 * The test database is migrated but never seeded, so there is no `frontend` or `mid` row to
 * borrow — minting is not merely tidier here, it is the only thing that works.
 */

/**
 * A role, the one level it offers and the one stack variant it offers — all published, with slugs
 * nothing else will use. The stack is minted whether or not a spec cares: a role that offers a
 * variant is the ordinary case, and a question tagged with none of them is still general, so
 * specs that predate the stack dimension behave exactly as they did (ADR-0015).
 */
export interface CataloguePair {
  roleId: string;
  roleSlug: string;
  roleName: string;
  levelId: string;
  levelSlug: string;
  levelName: string;
  stackId: string;
  stackSlug: string;
  stackName: string;
}

export async function seedCataloguePair(
  prisma: PrismaService,
  options: { status?: "draft" | "in_review" | "published" | "retired" } = {},
): Promise<CataloguePair> {
  const status = options.status ?? "published";
  const id = randomUUID().slice(0, 8);
  const level = await prisma.careerLevel.create({
    data: { slug: `fixture-level-${id}`, name: `Fixture level ${id}`, rank: 20, status },
  });
  const stack = await prisma.stack.create({
    data: { slug: `fixture-stack-${id}`, name: `Fixture stack ${id}`, status },
  });
  const role = await prisma.careerRole.create({
    data: {
      slug: `fixture-role-${id}`,
      name: `Fixture role ${id}`,
      position: 0,
      supportedQuestionTypes: ["technical", "scenario", "behavioral"],
      status,
      levels: { create: [{ levelId: level.id, position: 0 }] },
      stacks: { create: [{ stackId: stack.id, position: 0, isDefault: true }] },
    },
  });
  return {
    roleId: role.id,
    roleSlug: role.slug,
    roleName: role.name,
    levelId: level.id,
    levelSlug: level.slug,
    levelName: level.name,
    stackId: stack.id,
    stackSlug: stack.slug,
    stackName: stack.name,
  };
}

export async function removeCataloguePair(
  prisma: PrismaService,
  pair: CataloguePair,
): Promise<void> {
  // A role cannot be deleted while a candidate is preparing for it (the FK is `restrict`, which
  // is the point — see `role_in_use`). Test users outlive their specs, so their profiles go here.
  await prisma.profile.deleteMany({ where: { targetRoleId: pair.roleId } });
  await prisma.careerRoleLevel.deleteMany({ where: { roleId: pair.roleId } });
  await prisma.careerRoleStack.deleteMany({ where: { roleId: pair.roleId } });
  await prisma.careerRole.deleteMany({ where: { id: pair.roleId } });
  await prisma.careerLevel.deleteMany({ where: { id: pair.levelId } });
  await prisma.stack.deleteMany({ where: { id: pair.stackId } });
  await prisma.contentVersion.deleteMany({
    where: { entityId: { in: [pair.roleId, pair.levelId, pair.stackId] } },
  });
}

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
  /** The minted catalogue pair this fixture's content hangs from. */
  catalogue: CataloguePair;
  /** Slugs, as the wire carries them (ADR-0015). */
  role: string;
  level: string;
  /** Strings that must never appear in a candidate-facing response. */
  /** Never in any candidate response, anywhere, at any time. */
  answerKeyMarkers: string[];
  /** Only ever inside a turn the interviewer has spoken — see the note where they are planted. */
  plannedFollowUpMarkers: string[];
  /** Strings a candidate is supposed to see, so an empty response cannot pass for a clean one. */
  visibleMarkers: { prompt: string; lessonBody: string; trackTitle: string };
}

export interface SeedOptions {
  /** Defaults to published; pass a status to seed content at an earlier stage of the workflow. */
  status?: "draft" | "in_review" | "published" | "retired";
}

const marker = (what: string) => `ANSWERKEY-${what}-${randomUUID()}`;

export async function seedPublishedContent(
  prisma: PrismaService,
  options: SeedOptions = {},
): Promise<ContentFixture> {
  const status = options.status ?? "published";
  const id = randomUUID().slice(0, 8);

  // A pair of this fixture's own: nothing else can publish a track against it, so the partial
  // unique index is never contended and no spec has to be told which pair it may use.
  const catalogue = await seedCataloguePair(prisma);

  const idealPoints = [marker("ideal-1"), marker("ideal-2")];
  /*
   * The planned follow-ups are answer key, but they are the **one part of it with a moment when it
   * is allowed out**: they tell a candidate what they are about to be asked next, right up until
   * the interviewer asks it, at which point they hear it by definition (owner's decision,
   * 2026-09-23; M3 phase 3 is where a route first speaks one).
   *
   * So they are marked separately from the rest. `answerKeyMarkers` is the unconditional rule —
   * ideal points, criteria, weights and level descriptors, which no candidate response may ever
   * carry. `plannedFollowUpMarkers` is the conditional one: never in a content response, never in a
   * question the session has not reached, and only ever inside a turn the interviewer has spoken.
   */
  const plannedFollowUps = [{ criterion: 1, probe: marker("follow-up-1") }];
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
      roles: { create: [{ roleId: catalogue.roleId }] },
      levels: { create: [{ levelId: catalogue.levelId }] },
      type: "technical",
      topicId: topic.id,
      subtopic: null,
      difficulty: 3,
      prompt,
      context: null,
      rubricId: rubric.id,
      idealPoints,
      plannedFollowUps,
      status,
    },
  });

  const track = await prisma.track.create({
    data: {
      slug: `fixture-track-${id}`,
      roleId: catalogue.roleId,
      levelId: catalogue.levelId,
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
    catalogue,
    role: catalogue.roleSlug,
    level: catalogue.levelSlug,
    answerKeyMarkers: [
      ...idealPoints,
      ...criteria.flatMap((criterion) => [
        criterion.dimension,
        criterion.description,
        ...Object.values(criterion.levels),
      ]),
    ],
    plannedFollowUpMarkers: plannedFollowUps.map((plan) => plan.probe),
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
  // Last: a role cannot be deleted while a track or question still points at it.
  await removeCataloguePair(prisma, fixture.catalogue);
}

/**
 * Gives a signed-in test user the profile the candidate reads default to. `stack` is optional and
 * defaults to none — which, under the stack rule, means general questions only.
 */
export async function giveProfile(
  prisma: PrismaService,
  email: string,
  role: string,
  level: string,
  stack?: string,
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  // Slugs in, ids out: the fixture takes what the wire takes, so a spec reads the way the API
  // does. `findUniqueOrThrow` is the point — a typo'd slug fails here, not silently later.
  const [targetRole, targetLevel, targetStack] = await Promise.all([
    prisma.careerRole.findUniqueOrThrow({ where: { slug: role }, select: { id: true } }),
    prisma.careerLevel.findUniqueOrThrow({ where: { slug: level }, select: { id: true } }),
    stack ? prisma.stack.findUniqueOrThrow({ where: { slug: stack }, select: { id: true } }) : null,
  ]);
  const target = {
    targetRoleId: targetRole.id,
    targetLevelId: targetLevel.id,
    targetStackId: targetStack?.id ?? null,
  };
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...target,
      yearsExperience: 2,
      technologies: ["TypeScript"],
      targetCompanyType: "local_startup",
      onboardingCompletedAt: new Date(),
    },
    update: target,
  });
  return user.id;
}

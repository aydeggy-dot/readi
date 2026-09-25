import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type {
  CandidatePracticeResponse,
  Question,
  QuestionInput,
  Rubric,
  RubricInput,
  Topic,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import {
  giveProfile,
  removeCataloguePair,
  seedCataloguePair,
  type CataloguePair,
} from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * **One question, two roles** (M2.5, ADR-0015) — the mechanic the fourth launch role is built on.
 *
 * Full-stack has no bank of its own: it is the eleven frontend and backend questions that transfer,
 * each carrying `fullstack` as a second role. That only works if a question genuinely reaches the
 * candidates of every role it names, and keeps its stack narrowing while it does. Nothing tested
 * that before this file — `content-stacks.int.spec.ts` varies the stack with the role held fixed,
 * which is the other axis.
 *
 * Written against minted catalogue rows rather than the seeded ones, because the test database is
 * migrated and never seeded, and because a role a spec mints is a role nothing else can retire
 * underneath it.
 */
describe("a question written for more than one role", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  /** The first role, with its own level and its own default variant. */
  let first: CataloguePair;
  /** A second role offering the *same* level, with a variant of its own — the full-stack shape. */
  let secondRoleId: string;
  let secondRoleSlug: string;
  let secondStackId: string;
  let secondStackSlug: string;
  let topic: Topic;
  let rubricId: string;

  const questions: string[] = [];
  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({ cookie });
  const id = () => randomUUID().slice(0, 8);

  const publishQuestion = async (roles: string[], stacks: string[]): Promise<Question> => {
    const body: QuestionInput = {
      slug: `role-q-${id()}`,
      roles,
      levels: [first.levelSlug],
      stacks,
      type: "technical",
      topic_id: topic.id,
      subtopic: null,
      difficulty: 3,
      prompt: `Where does this logic belong? ${id()}`,
      context: null,
      rubric_id: rubricId,
      ideal_points: ["Says where, and why there"],
      planned_follow_ups: [],
    };
    const created = await http().post("/api/admin/content/questions").set(as(admin)).send(body);
    expect(created.status).toBe(201);
    const question = created.body as Question;
    questions.push(question.id);
    for (const transition of ["submit", "publish"]) {
      const moved = await http()
        .post(`/api/admin/content/questions/${question.id}/transition`)
        .set(as(admin))
        .send({ transition, note: null });
      expect(moved.status).toBe(201);
    }
    return question;
  };

  const practiceFor = async (role: string, stack: string | undefined): Promise<string[]> => {
    const { cookie, email } = await signUpWithEmail(app, uniqueEmail());
    await giveProfile(prisma, email, role, first.levelSlug, stack);
    const response = await http().get("/api/content/practice").set(as(cookie));
    expect(response.status).toBe(200);
    return (response.body as CandidatePracticeResponse).items.map((item) => item.slug);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    first = await seedCataloguePair(prisma);

    const stack = await prisma.stack.create({
      data: {
        slug: `fixture-stack-second-${id()}`,
        name: "The second role's variant",
        status: "published",
      },
    });
    secondStackId = stack.id;
    secondStackSlug = stack.slug;
    const role = await prisma.careerRole.create({
      data: {
        slug: `fixture-role-second-${id()}`,
        name: "The second role",
        position: 1,
        supportedQuestionTypes: ["technical", "scenario", "behavioral"],
        status: "published",
        levels: { create: [{ levelId: first.levelId, position: 0 }] },
        stacks: { create: [{ stackId: stack.id, position: 0, isDefault: true }] },
      },
    });
    secondRoleId = role.id;
    secondRoleSlug = role.slug;

    const adminUser = await signUpWithEmail(app, uniqueEmail());
    admin = adminUser.cookie;
    await setUserRole(prisma, { email: adminUser.email, role: "admin", actor: { type: "system" } });

    const topicResponse = await http()
      .post("/api/admin/content/topics")
      .set(as(admin))
      .send({ slug: `topic-${id()}`, name: "Where logic belongs", description: null });
    expect(topicResponse.status).toBe(201);
    topic = topicResponse.body as Topic;

    const rubricBody: RubricInput = {
      slug: `rubric-${id()}`,
      name: "Boundary reasoning",
      criteria: [
        {
          dimension: "Placement",
          description: "Puts the logic where it can be trusted.",
          weight: 60,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
        {
          dimension: "Reasoning",
          description: "Says why there and not somewhere else.",
          weight: 40,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
      ],
    };
    const rubric = await http().post("/api/admin/content/rubrics").set(as(admin)).send(rubricBody);
    expect(rubric.status).toBe(201);
    rubricId = (rubric.body as Rubric).id;
    for (const transition of ["submit", "publish"]) {
      await http()
        .post(`/api/admin/content/rubrics/${rubricId}/transition`)
        .set(as(admin))
        .send({ transition, note: null });
    }
  });

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    if (rubricId) await prisma.rubric.deleteMany({ where: { id: rubricId } });
    if (topic) await prisma.topic.deleteMany({ where: { id: topic.id } });
    if (secondRoleId) {
      await prisma.profile.deleteMany({ where: { targetRoleId: secondRoleId } });
      await prisma.careerRoleLevel.deleteMany({ where: { roleId: secondRoleId } });
      await prisma.careerRoleStack.deleteMany({ where: { roleId: secondRoleId } });
      await prisma.careerRole.deleteMany({ where: { id: secondRoleId } });
    }
    if (secondStackId) await prisma.stack.deleteMany({ where: { id: secondStackId } });
    if (first) await removeCataloguePair(prisma, first);
    await app.close();
  });

  it("reaches the candidates of every role it names, and nobody else's", async () => {
    const shared = await publishQuestion([first.roleSlug, secondRoleSlug], []);
    const firstOnly = await publishQuestion([first.roleSlug], []);

    const onFirst = await practiceFor(first.roleSlug, first.stackSlug);
    expect(onFirst).toContain(shared.slug);
    expect(onFirst).toContain(firstOnly.slug);

    const onSecond = await practiceFor(secondRoleSlug, secondStackSlug);
    expect(onSecond).toContain(shared.slug);
    // The whole point of tagging rather than copying: one row, and the role that did not ask for
    // it does not get it.
    expect(onSecond).not.toContain(firstOnly.slug);
  });

  it("keeps its stack narrowing in the second role as well as the first", async () => {
    const tagged = await publishQuestion([first.roleSlug, secondRoleSlug], [secondStackSlug]);

    // The second role offers that variant, so its candidate on it is asked the question.
    expect(await practiceFor(secondRoleSlug, secondStackSlug)).toContain(tagged.slug);

    /*
     * The first role names the question but not the variant it is tagged for, so its candidate is
     * never asked it. A second role tag widens who *may* see a question; it does not undo a
     * narrowing (ADR-0015). This is the case that would break if the stack filter were applied
     * per role rather than to the question.
     */
    expect(await practiceFor(first.roleSlug, first.stackSlug)).not.toContain(tagged.slug);
    expect(await practiceFor(first.roleSlug, undefined)).not.toContain(tagged.slug);
  });
});

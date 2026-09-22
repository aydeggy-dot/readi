import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type {
  CandidatePracticeResponse,
  Question,
  QuestionInput,
  QuestionListResponse,
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
 * **The stack dimension** (M2.5 phase 4, ADR-0015): which variant a question is written for, and
 * which one a candidate is interviewing for.
 *
 * `question-eligibility.spec.ts` asserts the rule as a truth table over the pure predicate. This
 * file runs the same table through the database, because the predicate and the Prisma filter are
 * two expressions of one rule and the way they fail is by drifting apart.
 */
describe("the stack dimension", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  let pair: CataloguePair;
  let topic: Topic;
  let rubricId: string;
  /** A second published variant the same role offers, so "tagged for someone else" is reachable. */
  let otherStackId: string;
  let otherStackSlug: string;

  const questions: string[] = [];
  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({ cookie });
  const id = () => randomUUID().slice(0, 8);

  /** A published question tagged for `stacks` (empty = general to the role). */
  const publishQuestion = async (stacks: string[]): Promise<Question> => {
    const body: QuestionInput = {
      slug: `stack-q-${id()}`,
      roles: [pair.roleSlug],
      levels: [pair.levelSlug],
      stacks,
      type: "technical",
      topic_id: topic.id,
      subtopic: null,
      difficulty: 3,
      prompt: `How would you test this? ${id()}`,
      context: null,
      rubric_id: rubricId,
      ideal_points: ["Measures first"],
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

  /** The slugs a candidate on `stack` is offered, out of the ones this spec created. */
  const practiceFor = async (stack: string | undefined): Promise<string[]> => {
    const { cookie, email } = await signUpWithEmail(app, uniqueEmail());
    await giveProfile(prisma, email, pair.roleSlug, pair.levelSlug, stack);
    const response = await http().get("/api/content/practice").set(as(cookie));
    expect(response.status).toBe(200);
    const body = response.body as CandidatePracticeResponse;
    return body.items.map((item) => item.slug);
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    pair = await seedCataloguePair(prisma);

    const other = await prisma.stack.create({
      data: { slug: `fixture-stack-other-${id()}`, name: "The other variant", status: "published" },
    });
    otherStackId = other.id;
    otherStackSlug = other.slug;
    await prisma.careerRoleStack.create({
      data: { roleId: pair.roleId, stackId: other.id, position: 1, isDefault: false },
    });

    const adminUser = await signUpWithEmail(app, uniqueEmail());
    admin = adminUser.cookie;
    await setUserRole(prisma, { email: adminUser.email, role: "admin", actor: { type: "system" } });

    const topicResponse = await http()
      .post("/api/admin/content/topics")
      .set(as(admin))
      .send({ slug: `topic-${id()}`, name: "Testing", description: null });
    expect(topicResponse.status).toBe(201);
    topic = topicResponse.body as Topic;

    const rubricBody: RubricInput = {
      slug: `rubric-${id()}`,
      name: "Test design",
      criteria: [
        {
          dimension: "Coverage",
          description: "Picks cases that would actually catch something.",
          weight: 60,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
        {
          dimension: "Reasoning",
          description: "Says why those cases and not others.",
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
    // Every `id:` here is guarded: an undefined id is no filter at all in Prisma, so a `beforeAll`
    // that failed half way would otherwise empty the table rather than clean up after itself.
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    if (rubricId) await prisma.rubric.deleteMany({ where: { id: rubricId } });
    if (topic) await prisma.topic.deleteMany({ where: { id: topic.id } });
    if (otherStackId) {
      await prisma.careerRoleStack.deleteMany({ where: { stackId: otherStackId } });
      await prisma.profile.deleteMany({ where: { targetStackId: otherStackId } });
      await prisma.stack.deleteMany({ where: { id: otherStackId } });
    }
    if (pair) await removeCataloguePair(prisma, pair);
    await app.close();
  });

  describe("what a candidate is offered", () => {
    it("follows the stack rule: general always, tagged only to its own", async () => {
      const general = await publishQuestion([]);
      const mine = await publishQuestion([pair.stackSlug]);
      const theirs = await publishQuestion([otherStackSlug]);
      const both = await publishQuestion([pair.stackSlug, otherStackSlug]);

      const onMine = await practiceFor(pair.stackSlug);
      expect(onMine).toContain(general.slug);
      expect(onMine).toContain(mine.slug);
      expect(onMine).toContain(both.slug);
      expect(onMine).not.toContain(theirs.slug);

      const onTheirs = await practiceFor(otherStackSlug);
      expect(onTheirs).toContain(general.slug);
      expect(onTheirs).toContain(theirs.slug);
      expect(onTheirs).toContain(both.slug);
      expect(onTheirs).not.toContain(mine.slug);

      /*
       * The decision worth a test of its own: a candidate who chose no variant gets the general
       * set and nothing else. Showing them every variant's questions would hand a Node developer
       * Spring code because nobody said which they use.
       */
      const undecided = await practiceFor(undefined);
      expect(undecided).toContain(general.slug);
      expect(undecided).not.toContain(mine.slug);
      expect(undecided).not.toContain(theirs.slug);
      expect(undecided).not.toContain(both.slug);
    });
  });

  describe("tagging a question in the CMS", () => {
    it("stores the tags, lists them, and takes them off again", async () => {
      const question = await publishQuestion([pair.stackSlug]);
      expect(question.stacks).toEqual([pair.stackSlug]);

      const read = await http().get(`/api/admin/content/questions/${question.id}`).set(as(admin));
      expect((read.body as Question).stacks).toEqual([pair.stackSlug]);

      // A PUT replaces the set, so an empty array is how a question becomes general again.
      const put = await http()
        .put(`/api/admin/content/questions/${question.id}`)
        .set(as(admin))
        .send({ ...(read.body as Question), stacks: [] });
      expect(put.status).toBe(200);
      expect((put.body as Question).stacks).toEqual([]);
    });

    it("refuses a stack that is not in the catalogue", async () => {
      const response = await http()
        .post("/api/admin/content/questions")
        .set(as(admin))
        .send({
          slug: `stack-q-${id()}`,
          roles: [pair.roleSlug],
          levels: [pair.levelSlug],
          stacks: ["no-such-stack"],
          type: "technical",
          topic_id: topic.id,
          subtopic: null,
          difficulty: 3,
          prompt: "Why?",
          context: null,
          rubric_id: rubricId,
          ideal_points: ["Because"],
        });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "stack_not_found" });
    });

    it("filters the CMS list by the stack a question is tagged for, not by who would see it", async () => {
      const general = await publishQuestion([]);
      const tagged = await publishQuestion([pair.stackSlug]);

      const response = await http()
        .get("/api/admin/content/questions")
        .query({ stack: pair.stackSlug, limit: 100 })
        .set(as(admin));
      expect(response.status).toBe(200);
      const slugs = (response.body as QuestionListResponse).items.map((item) => item.slug);
      expect(slugs).toContain(tagged.slug);
      // The difference from the candidate rule: a general question is *not* tagged for this
      // stack, so it is not part of the answer to "what have we written for it".
      expect(slugs).not.toContain(general.slug);
    });
  });

  describe("retiring a stack", () => {
    it("is refused while a published question is tagged with it", async () => {
      const stack = await prisma.stack.create({
        data: { slug: `fixture-stack-${id()}`, name: "Doomed", status: "published" },
      });
      await publishQuestion([stack.slug]);

      const response = await http()
        .post(`/api/admin/content/stacks/${stack.id}/transition`)
        .set(as(admin))
        .send({ transition: "retire", note: null });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "stack_in_use" });

      await prisma.questionStack.deleteMany({ where: { stackId: stack.id } });
      await prisma.stack.delete({ where: { id: stack.id } });
    });

    it("is refused while a candidate is interviewing for it", async () => {
      const stack = await prisma.stack.create({
        data: { slug: `fixture-stack-${id()}`, name: "Chosen", status: "published" },
      });
      await prisma.careerRoleStack.create({
        data: { roleId: pair.roleId, stackId: stack.id, position: 9, isDefault: false },
      });
      const { email } = await signUpWithEmail(app, uniqueEmail());
      await giveProfile(prisma, email, pair.roleSlug, pair.levelSlug, stack.slug);
      // The role's own offer is removed first, so what refuses the retire is the profile alone.
      await prisma.careerRoleStack.deleteMany({ where: { stackId: stack.id } });

      const response = await http()
        .post(`/api/admin/content/stacks/${stack.id}/transition`)
        .set(as(admin))
        .send({ transition: "retire", note: null });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "stack_in_use" });

      await prisma.profile.deleteMany({ where: { targetStackId: stack.id } });
      await prisma.stack.delete({ where: { id: stack.id } });
    });
  });

  describe("choosing a variant on the profile", () => {
    it("refuses one the candidate's role does not offer", async () => {
      const stranger = await prisma.stack.create({
        data: { slug: `fixture-stack-${id()}`, name: "Another role's", status: "published" },
      });
      const { cookie } = await signUpWithEmail(app, uniqueEmail());
      const response = await http()
        .put("/api/me/profile")
        .set(as(cookie))
        .send({
          name: "Ada",
          target_role: pair.roleSlug,
          level: pair.levelSlug,
          target_stack: stranger.slug,
          years_experience: 2,
          technologies: ["Go"],
          target_company_type: "local_startup",
          target_date: null,
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("target_stack");

      await prisma.stack.delete({ where: { id: stranger.id } });
    });
  });
});

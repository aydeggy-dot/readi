import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type {
  ContentVersionResponse,
  ContentVersionsResponse,
  Question,
  QuestionInput,
  Rubric,
  RubricInput,
  Topic,
  Track,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import { giveProfile } from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * The CMS: who may do what, what publishing refuses, and what the version history remembers.
 * This file owns the (frontend, intern_junior) pair — see `content-fixtures.ts`.
 */
describe("admin content API", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let expert: string;
  let admin: string;
  let candidate: string;
  let candidateEmail: string;
  let topic: Topic;
  const tracks: string[] = [];
  const questions: string[] = [];
  const rubrics: string[] = [];
  const topics: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (cookie: string) => ({ cookie });
  const id = () => randomUUID().slice(0, 8);

  const createRubric = async (
    cookie: string,
    overrides: Partial<RubricInput> = {},
  ): Promise<Rubric> => {
    const body: RubricInput = {
      slug: `rubric-${id()}`,
      name: "Performance reasoning",
      criteria: [
        {
          dimension: "Problem framing",
          description: "Restates the problem and names the constraint that matters.",
          weight: 60,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
        {
          dimension: "Measurement",
          description: "Measures before changing anything.",
          weight: 40,
          levels: { "0": "Absent", "1": "Vague", "2": "Partial", "3": "Clear", "4": "Excellent" },
        },
      ],
      ...overrides,
    };
    const response = await http().post("/api/admin/content/rubrics").set(as(cookie)).send(body);
    expect(response.status).toBe(201);
    const rubric = response.body as Rubric;
    rubrics.push(rubric.id);
    return rubric;
  };

  const createQuestion = async (
    cookie: string,
    rubricId: string,
    overrides: Partial<QuestionInput> = {},
  ): Promise<Question> => {
    const body: QuestionInput = {
      slug: `question-${id()}`,
      roles: ["frontend"],
      levels: ["intern_junior"],
      type: "technical",
      topic_id: topic.id,
      subtopic: null,
      difficulty: 3,
      prompt: "A product page is slow on older Android phones. What would you do?",
      context: null,
      rubric_id: rubricId,
      ideal_points: ["Measures before changing anything"],
      ...overrides,
    };
    const response = await http().post("/api/admin/content/questions").set(as(cookie)).send(body);
    expect(response.status).toBe(201);
    const question = response.body as Question;
    questions.push(question.id);
    return question;
  };

  const createTrack = async (cookie: string, slug = `track-${id()}`): Promise<Track> => {
    const response = await http()
      .post("/api/admin/content/tracks")
      .set(as(cookie))
      .send({
        slug,
        role: "frontend",
        level: "intern_junior",
        title: "Frontend, intern",
        summary: null,
        topics: [{ topic_id: topic.id, is_core: true }],
      });
    expect(response.status).toBe(201);
    const track = response.body as Track;
    tracks.push(track.id);
    return track;
  };

  const move = (cookie: string, path: string, entityId: string, transition: string, note = null) =>
    http()
      .post(`/api/admin/content/${path}/${entityId}/transition`)
      .set(as(cookie))
      .send({ transition, note });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await prisma.track.deleteMany({
      where: { role: "frontend", level: "intern_junior", status: "published" },
    });

    const expertUser = await signUpWithEmail(app, uniqueEmail());
    expert = expertUser.cookie;
    await setUserRole(prisma, {
      email: expertUser.email,
      role: "content_expert",
      actor: { type: "system" },
    });

    const adminUser = await signUpWithEmail(app, uniqueEmail());
    admin = adminUser.cookie;
    await setUserRole(prisma, { email: adminUser.email, role: "admin", actor: { type: "system" } });

    const candidateUser = await signUpWithEmail(app, uniqueEmail());
    candidate = candidateUser.cookie;
    candidateEmail = candidateUser.email;
    await giveProfile(prisma, candidateEmail, "frontend", "intern_junior");

    const response = await http()
      .post("/api/admin/content/topics")
      .set(as(admin))
      .send({ slug: `topic-${id()}`, name: "Performance", description: null });
    expect(response.status).toBe(201);
    topic = response.body as Topic;
    topics.push(topic.id);
  });

  afterAll(async () => {
    await prisma.track.deleteMany({ where: { id: { in: tracks } } });
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    await prisma.rubric.deleteMany({ where: { id: { in: rubrics } } });
    await prisma.topic.deleteMany({ where: { id: { in: topics } } });
    await app.close();
  });

  describe("who may reach the CMS", () => {
    it("turns a candidate away", async () => {
      const responses = await Promise.all([
        http().get("/api/admin/content/questions").set(as(candidate)),
        http().post("/api/admin/content/topics").set(as(candidate)).send({}),
      ]);
      expect(responses.map((response) => response.status)).toEqual([403, 403]);
    });

    it("turns away a visitor with no session at all", async () => {
      expect((await http().get("/api/admin/content/questions")).status).toBe(401);
    });
  });

  describe("the milestone's workflow, end to end", () => {
    it("expert writes and submits, admin publishes, and only then does a candidate see it", async () => {
      const rubric = await createRubric(expert);
      const question = await createQuestion(expert, rubric.id);
      expect(question.status).toBe("draft");

      // Nothing is visible to a candidate before it is published.
      const before = await http().get("/api/content/practice").set(as(candidate));
      expect(before.status).toBe(200);
      expect(JSON.stringify(before.body)).not.toContain(question.slug);

      expect((await move(expert, "rubrics", rubric.id, "submit")).status).toBe(201);
      expect((await move(expert, "questions", question.id, "submit")).status).toBe(201);

      // Publishing is an admin's call, whatever the content expert would like.
      const refused = await move(expert, "questions", question.id, "publish");
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ code: "content_transition_forbidden" });

      // A question cannot go out before the rubric that scores it.
      const tooSoon = await move(admin, "questions", question.id, "publish");
      expect(tooSoon.status).toBe(409);
      expect(tooSoon.body).toMatchObject({ code: "question_rubric_not_published" });

      expect((await move(admin, "rubrics", rubric.id, "publish")).status).toBe(201);
      const published = await move(admin, "questions", question.id, "publish");
      expect(published.status).toBe(201);
      expect(published.body).toMatchObject({ entity: "questions", status: "published" });

      const after = await http().get("/api/content/practice").set(as(candidate));
      expect(JSON.stringify(after.body)).toContain(question.slug);
    });

    it("refuses a move from the wrong status", async () => {
      const rubric = await createRubric(expert);
      const response = await move(admin, "rubrics", rubric.id, "publish");
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "content_transition_invalid" });
    });

    it("retires published content and keeps when it was published", async () => {
      const rubric = await createRubric(expert);
      await move(expert, "rubrics", rubric.id, "submit");
      await move(admin, "rubrics", rubric.id, "publish");
      const publishedAt = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
      expect(publishedAt.publishedAt).not.toBeNull();

      expect((await move(admin, "rubrics", rubric.id, "retire")).status).toBe(201);
      const retired = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
      expect(retired.status).toBe("retired");
      expect(retired.publishedAt).toEqual(publishedAt.publishedAt);
    });
  });

  describe("what publishing refuses", () => {
    it("a rubric whose weights do not add up to 100", async () => {
      const rubric = await createRubric(expert);
      // The contract refuses this at the boundary, so only a write from elsewhere — the seed
      // importer, a migration, a hand-edited row — can produce it. The guard is the second line.
      await prisma.rubricCriterion.updateMany({
        where: { rubricId: rubric.id },
        data: { weight: 10 },
      });
      await move(expert, "rubrics", rubric.id, "submit");
      const response = await move(admin, "rubrics", rubric.id, "publish");
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "rubric_weights_invalid" });
    });

    it("a track with no modules, and a second track for a role and level already served", async () => {
      const track = await createTrack(expert);
      await move(expert, "tracks", track.id, "submit");
      const empty = await move(admin, "tracks", track.id, "publish");
      expect(empty.status).toBe(409);
      expect(empty.body).toMatchObject({ code: "track_has_no_modules" });

      const module = await http()
        .post(`/api/admin/content/tracks/${track.id}/modules`)
        .set(as(expert))
        .send({ slug: `module-${id()}`, title: "Rendering", summary: null, position: 0 });
      expect(module.status).toBe(201);
      expect((await move(admin, "tracks", track.id, "publish")).status).toBe(201);

      const rival = await createTrack(expert);
      await http()
        .post(`/api/admin/content/tracks/${rival.id}/modules`)
        .set(as(expert))
        .send({ slug: `module-${id()}`, title: "Rendering", summary: null, position: 0 });
      await move(expert, "tracks", rival.id, "submit");
      const refused = await move(admin, "tracks", rival.id, "publish");
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: "track_already_published" });
    });
  });

  describe("version history", () => {
    it("keeps what changed, and stays quiet when nothing did", async () => {
      const rubric = await createRubric(expert);
      const question = await createQuestion(expert, rubric.id);
      const put = (body: unknown) =>
        http()
          .put(`/api/admin/content/questions/${question.id}`)
          .set(as(expert))
          .send(body as object);

      const asInput = (source: Question): QuestionInput => ({
        slug: source.slug,
        roles: source.roles,
        levels: source.levels,
        type: source.type,
        topic_id: source.topic_id,
        subtopic: source.subtopic,
        difficulty: source.difficulty,
        prompt: source.prompt,
        context: source.context,
        rubric_id: source.rubric_id,
        ideal_points: source.ideal_points,
      });

      // Saving the same content again changes nothing: no new version, no version bump.
      const unchanged = await put(asInput(question));
      expect(unchanged.status).toBe(200);
      expect((unchanged.body as Question).version).toBe(1);

      const edited = await put({ ...asInput(question), prompt: "A rewritten prompt." });
      expect((edited.body as Question).version).toBe(2);
      expect((edited.body as Question).prompt).toBe("A rewritten prompt.");

      const versions = await http()
        .get(`/api/admin/content/questions/${question.id}/versions`)
        .set(as(expert));
      expect(versions.status).toBe(200);
      expect((versions.body as ContentVersionsResponse).versions).toEqual([
        expect.objectContaining({ version: 1 }),
      ]);

      const snapshot = await http()
        .get(`/api/admin/content/questions/${question.id}/versions/1`)
        .set(as(expert));
      const stored = snapshot.body as ContentVersionResponse;
      expect(stored.entity_type).toBe("question");
      // Version 1 holds the question as it was before the edit — the original prompt.
      expect(stored.snapshot).toMatchObject({ prompt: question.prompt, status: "draft" });
    });

    it("records a transition, with the note that explains it", async () => {
      const rubric = await createRubric(expert);
      await http()
        .post(`/api/admin/content/rubrics/${rubric.id}/transition`)
        .set(as(expert))
        .send({ transition: "submit", note: "ready for review" });

      const versions = await http()
        .get(`/api/admin/content/rubrics/${rubric.id}/versions`)
        .set(as(expert));
      expect((versions.body as ContentVersionsResponse).versions[0]).toMatchObject({
        version: 1,
        change_note: "ready for review",
      });
    });

    it("versions a track when one of its modules changes", async () => {
      const track = await createTrack(expert);
      const module = await http()
        .post(`/api/admin/content/tracks/${track.id}/modules`)
        .set(as(expert))
        .send({ slug: `module-${id()}`, title: "Rendering", summary: null, position: 0 });
      expect(module.status).toBe(201);

      const after = await http().get(`/api/admin/content/tracks/${track.id}`).set(as(expert));
      expect((after.body as Track).version).toBe(2);
      const versions = await http()
        .get(`/api/admin/content/tracks/${track.id}/versions`)
        .set(as(expert));
      expect((versions.body as ContentVersionsResponse).versions).toHaveLength(1);
    });
  });

  describe("listing", () => {
    it("filters, searches and pages with a cursor", async () => {
      const slug = `searchable-${id()}`;
      await createRubric(expert, { slug });
      await createRubric(expert);
      await createRubric(expert);

      const found = await http()
        .get("/api/admin/content/rubrics")
        .query({ q: slug.slice(0, 12), status: "draft" })
        .set(as(expert));
      expect(found.status).toBe(200);
      expect(found.body).toMatchObject({ items: [expect.objectContaining({ slug })] });

      const first = await http()
        .get("/api/admin/content/rubrics")
        .query({ limit: 2 })
        .set(as(expert));
      const firstPage = first.body as { items: { id: string }[]; next_cursor: string | null };
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.next_cursor).toBeTruthy();

      const second = await http()
        .get("/api/admin/content/rubrics")
        .query({ limit: 2, cursor: firstPage.next_cursor })
        .set(as(expert));
      const secondPage = second.body as { items: { id: string }[] };
      const seen = new Set(firstPage.items.map((item) => item.id));
      expect(secondPage.items.some((item) => seen.has(item.id))).toBe(false);
    });

    it("rejects an unreadable cursor rather than ignoring it", async () => {
      const response = await http()
        .get("/api/admin/content/rubrics")
        .query({ cursor: "not-a-cursor" })
        .set(as(expert));
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "content_cursor_invalid" });
    });
  });

  describe("marking a model's draft reviewed (ADR-0014 decision 6)", () => {
    /**
     * Only the seed importer marks a row as an unreviewed AI draft, and it writes through
     * `ContentService`. The tests reach the same state directly, which is also the state the
     * migration's backfill left every seeded row in.
     */
    const asAiDraft = (entityId: string) =>
      prisma.rubric.update({ where: { id: entityId }, data: { aiDraftUnreviewed: true } });

    it("is an expert's to record, and says who and when", async () => {
      const rubric = await createRubric(expert);
      await asAiDraft(rubric.id);

      const response = await http()
        .post(`/api/admin/content/rubrics/${rubric.id}/reviewed`)
        .set(as(expert))
        .send({ note: "read it end to end" });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        entity: "rubrics",
        id: rubric.id,
        ai_draft_unreviewed: false,
        version: rubric.version + 1,
      });
      expect(
        Date.parse(String((response.body as { reviewed_at: string }).reviewed_at)),
      ).toBeGreaterThan(0);

      // The reviewer's name is on the row and in the audit log, never in the response.
      expect(JSON.stringify(response.body)).not.toContain("reviewed_by");
      const row = await prisma.rubric.findUniqueOrThrow({ where: { id: rubric.id } });
      expect(row.aiDraftUnreviewed).toBe(false);
      expect(row.reviewedByUserId).toEqual(expect.any(String));
      const entry = await prisma.auditLog.findFirst({
        where: { action: "content.rubric.reviewed", targetId: rubric.id },
      });
      expect(entry?.actorId).toBe(row.reviewedByUserId);

      // And the history carries the reviewer's note, so the version says why.
      const versions = await http()
        .get(`/api/admin/content/rubrics/${rubric.id}/versions`)
        .set(as(expert));
      expect((versions.body as ContentVersionsResponse).versions[0]).toMatchObject({
        change_note: "read it end to end",
      });
    });

    it("refuses when there is nothing to review, so a second click churns no history", async () => {
      const rubric = await createRubric(expert);
      // Written in the CMS by a person: it was never an AI draft.
      const never = await http()
        .post(`/api/admin/content/rubrics/${rubric.id}/reviewed`)
        .set(as(expert))
        .send({ note: null });
      expect(never.status).toBe(409);
      expect(never.body).toMatchObject({ code: "content_not_unreviewed" });

      await asAiDraft(rubric.id);
      expect(
        (
          await http()
            .post(`/api/admin/content/rubrics/${rubric.id}/reviewed`)
            .set(as(expert))
            .send({ note: null })
        ).status,
      ).toBe(200);
      const again = await http()
        .post(`/api/admin/content/rubrics/${rubric.id}/reviewed`)
        .set(as(expert))
        .send({ note: null });
      expect(again.status).toBe(409);
    });

    it("is not cleared by editing the content: a typo fix is not a review", async () => {
      const rubric = await createRubric(expert);
      await asAiDraft(rubric.id);
      const edited = await http()
        .put(`/api/admin/content/rubrics/${rubric.id}`)
        .set(as(expert))
        .send({
          slug: rubric.slug,
          name: "Performance reasoning, corrected",
          criteria: rubric.criteria.map(({ id: _id, ...criterion }) => criterion),
        });
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ ai_draft_unreviewed: true });
      // The edit did take the row away from the seed files, which is a different question.
      expect(edited.body).toMatchObject({ seed_managed: false });
    });

    it("does not refuse publishing outside production, and claims no override for it", async () => {
      const rubric = await createRubric(expert);
      await asAiDraft(rubric.id);
      await move(expert, "rubrics", rubric.id, "submit");
      const published = await move(admin, "rubrics", rubric.id, "publish");
      expect(published.status).toBe(201);

      // Here the guard never ran, so nothing was overridden. An audit entry saying it was would
      // be a lie that a later search for real overrides would trip over.
      const entry = await prisma.auditLog.findFirst({
        where: { action: "content.rubric.published", targetId: rubric.id },
      });
      expect(entry?.after).not.toMatchObject({ acknowledged_unreviewed: true });
    });
  });

  describe("writing rules", () => {
    it("refuses a slug that is already taken", async () => {
      const first = await createRubric(expert);
      const response = await http()
        .post("/api/admin/content/rubrics")
        .set(as(expert))
        .send({
          slug: first.slug,
          name: "Duplicate",
          criteria: [
            {
              dimension: "One",
              description: "Only criterion.",
              weight: 100,
              levels: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
            },
            {
              dimension: "Two",
              description: "Unreachable.",
              weight: 0,
              levels: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
            },
          ],
        });
      // The weights are refused first; fix them and the slug is what is left.
      expect(response.status).toBe(400);

      const valid = await http()
        .post("/api/admin/content/rubrics")
        .set(as(expert))
        .send({
          slug: first.slug,
          name: "Duplicate",
          criteria: [
            {
              dimension: "One",
              description: "First criterion.",
              weight: 50,
              levels: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
            },
            {
              dimension: "Two",
              description: "Second criterion.",
              weight: 50,
              levels: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
            },
          ],
        });
      expect(valid.status).toBe(409);
      expect(valid.body).toMatchObject({ code: "content_slug_taken" });
    });

    it("reports an unknown topic as a field error, not a 500", async () => {
      const rubric = await createRubric(expert);
      const response = await http()
        .post("/api/admin/content/questions")
        .set(as(expert))
        .send({
          slug: `question-${id()}`,
          roles: ["frontend"],
          levels: ["intern_junior"],
          type: "technical",
          topic_id: randomUUID(),
          subtopic: null,
          difficulty: 3,
          prompt: "Why?",
          context: null,
          rubric_id: rubric.id,
          ideal_points: ["Because"],
        });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("topic_id");
    });

    it("answers for content that is not there", async () => {
      const missing = randomUUID();
      const responses = await Promise.all([
        http().get(`/api/admin/content/questions/${missing}`).set(as(expert)),
        http().get(`/api/admin/content/tracks/${missing}`).set(as(expert)),
        http().get(`/api/admin/content/rubrics/${missing}/versions`).set(as(expert)),
      ]);
      expect(responses.map((response) => response.status)).toEqual([404, 404, 404]);
      expect(responses[0]?.body).toMatchObject({ code: "question_not_found" });
    });
  });
});

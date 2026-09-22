import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { CandidatePracticeResponse, CandidateTrackResponse } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  giveProfile,
  removeCataloguePair,
  removeContent,
  seedCataloguePair,
  seedPublishedContent,
  type CataloguePair,
  type ContentFixture,
} from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * The candidate's view of the content: published only, from a published track, and never more of
 * it than the candidate's own role and level. This file owns the (backend, mid) pair.
 */
describe("candidate content API", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;
  let cookie: string;
  /** A second signed-in user who never finished onboarding. */
  let profileless: string;
  const extra: string[] = [];
  const otherPairs: CataloguePair[] = [];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);

    const candidate = await signUpWithEmail(app, uniqueEmail());
    cookie = candidate.cookie;
    await giveProfile(prisma, candidate.email, fixture.role, fixture.level);
    profileless = (await signUpWithEmail(app, uniqueEmail())).cookie;
  });

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { id: { in: extra } } });
    await prisma.lesson.deleteMany({ where: { id: { in: extra } } });
    for (const pair of otherPairs) await removeCataloguePair(prisma, pair);
    await removeContent(prisma, fixture);
    await app.close();
  });

  it("needs a signed-in user", async () => {
    const responses = await Promise.all([
      http().get("/api/content/track"),
      http().get("/api/content/practice"),
      http().get(`/api/content/lessons/${fixture.lessonSlug}`),
    ]);
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401]);
  });

  describe("the track", () => {
    it("is the published one for the candidate's role and level", async () => {
      const response = await http().get("/api/content/track").set({ cookie });
      expect(response.status).toBe(200);
      const track = response.body as CandidateTrackResponse;
      expect(track).toMatchObject({ role: fixture.role, level: fixture.level });
      expect(track.modules[0]?.lessons[0]?.slug).toBe(fixture.lessonSlug);
    });

    it("leaves out a lesson that is not published", async () => {
      const draft = await prisma.lesson.create({
        data: {
          moduleId: fixture.moduleId,
          slug: `draft-lesson-${randomUUID().slice(0, 8)}`,
          title: "Not ready",
          body: "Draft.",
          position: 1,
          status: "draft",
        },
      });
      extra.push(draft.id);

      const response = await http().get("/api/content/track").set({ cookie });
      const track = response.body as CandidateTrackResponse;
      expect(track.modules[0]?.lessons.map((lesson) => lesson.slug)).toEqual([fixture.lessonSlug]);
    });

    it("says there is nothing published for a role and level with no track", async () => {
      const response = await http()
        .get("/api/content/track")
        .query({ role: "qa", level: "mid" })
        .set({ cookie });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "track_not_found" });
    });

    it("asks a candidate without a profile for a role and level", async () => {
      const response = await http().get("/api/content/track").set({ cookie: profileless });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "profile_required" });

      const asked = await http()
        .get("/api/content/track")
        .query({ role: fixture.role, level: fixture.level })
        .set({ cookie: profileless });
      expect(asked.status).toBe(200);
    });
  });

  describe("a lesson", () => {
    it("is readable by slug while its track is published", async () => {
      const response = await http()
        .get(`/api/content/lessons/${fixture.lessonSlug}`)
        .set({ cookie });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        slug: fixture.lessonSlug,
        body: fixture.visibleMarkers.lessonBody,
      });
    });

    it("disappears with its track: a published lesson under an unpublished track is not readable", async () => {
      await prisma.track.update({ where: { id: fixture.trackId }, data: { status: "retired" } });
      try {
        const response = await http()
          .get(`/api/content/lessons/${fixture.lessonSlug}`)
          .set({ cookie });
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ code: "lesson_not_found" });
      } finally {
        await prisma.track.update({
          where: { id: fixture.trackId },
          data: { status: "published" },
        });
      }
    });

    it("answers 404 for a slug that is not there", async () => {
      const response = await http().get("/api/content/lessons/no-such-lesson").set({ cookie });
      expect(response.status).toBe(404);
    });

    it("rejects a slug that is not a slug", async () => {
      expect((await http().get("/api/content/lessons/Not%20A%20Slug").set({ cookie })).status).toBe(
        400,
      );
    });
  });

  describe("practice questions", () => {
    it("returns the published ones for the candidate's role and level", async () => {
      const response = await http().get("/api/content/practice").set({ cookie });
      expect(response.status).toBe(200);
      const items = (response.body as CandidatePracticeResponse).items;
      expect(items.map((item) => item.slug)).toContain(fixture.questionSlug);
    });

    it("leaves out a question whose rubric is not published: nothing could score the answer", async () => {
      await prisma.rubric.update({ where: { id: fixture.rubricId }, data: { status: "draft" } });
      try {
        const response = await http().get("/api/content/practice").set({ cookie });
        const items = (response.body as CandidatePracticeResponse).items;
        expect(items.map((item) => item.slug)).not.toContain(fixture.questionSlug);
      } finally {
        await prisma.rubric.update({
          where: { id: fixture.rubricId },
          data: { status: "published" },
        });
      }
    });

    it("leaves out a question for another role", async () => {
      const otherRole = await seedCataloguePair(prisma);
      otherPairs.push(otherRole);
      const other = await prisma.question.create({
        data: {
          slug: `other-role-${randomUUID().slice(0, 8)}`,
          roles: { create: [{ roleId: otherRole.roleId }] },
          levels: { create: [{ levelId: fixture.catalogue.levelId }] },
          type: "scenario",
          topicId: fixture.topicId,
          difficulty: 2,
          prompt: "A QA question.",
          rubricId: fixture.rubricId,
          idealPoints: ["Something"],
          status: "published",
        },
      });
      extra.push(other.id);

      const response = await http().get("/api/content/practice").set({ cookie });
      const items = (response.body as CandidatePracticeResponse).items;
      expect(items.map((item) => item.slug)).not.toContain(other.slug);
    });

    it("filters by topic and honours a limit", async () => {
      const byTopic = await http()
        .get("/api/content/practice")
        .query({ topic: fixture.topicSlug, limit: 1 })
        .set({ cookie });
      expect(byTopic.status).toBe(200);
      expect((byTopic.body as CandidatePracticeResponse).items).toHaveLength(1);

      const elsewhere = await http()
        .get("/api/content/practice")
        .query({ topic: "no-such-topic" })
        .set({ cookie });
      expect((elsewhere.body as CandidatePracticeResponse).items).toEqual([]);
    });

    it("refuses a limit outside what the API will serve", async () => {
      const response = await http()
        .get("/api/content/practice")
        .query({ limit: 1000 })
        .set({ cookie });
      expect(response.status).toBe(400);
    });
  });
});

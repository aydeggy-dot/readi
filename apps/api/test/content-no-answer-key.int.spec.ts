import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOpenApiDocument } from "../src/openapi";
import { answerKeyLeaks } from "./answer-key";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * **The leak test.** Candidate-facing responses never carry the answer key — no rubric, no
 * criterion, no level descriptor, no ideal point (CLAUDE.md §5, ADR-0014). This is the test that
 * enforces it, and the one test in this milestone that must never be weakened to make something
 * else pass.
 *
 * It is built so that it cannot pass by accident:
 *
 * - The fixture is **real published content with a real answer key**: every ideal point, criterion
 *   and level descriptor carries a unique `ANSWERKEY-…` marker, and the test first proves those
 *   markers are reachable through the admin API before asserting they are absent elsewhere.
 * - The endpoints are **read from the generated OpenAPI document**, not hand-listed, so a new
 *   candidate GET route fails this test until someone exercises it here.
 * - Each response is checked twice: no marker anywhere in the raw JSON, and no key matching
 *   `rubric | criteri | ideal_point | levels | weight` at any depth. (`level` on its own is the
 *   candidate's experience level and is theirs to see; `levels` is a rubric's descriptors.)
 * - Two **negative controls** run the detector against payloads that do carry the answer key — the
 *   admin response, and a candidate response with a rubric grafted onto it — and require it to
 *   object. A detector that cannot fail cannot protect anything.
 *
 * Checked by hand once, on 2026-09-20: adding `ideal_points` to `CandidatePracticeItem` and to the
 * mapper that builds it made this file fail on both counts — the marker text and the field name —
 * and nothing else in the suite noticed. That is the failure this test exists to cause.
 */

describe("candidate content never carries the answer key", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;
  let candidateCookie: string;
  let adminCookie: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);

    const candidate = await signUpWithEmail(app, uniqueEmail());
    candidateCookie = candidate.cookie;
    await giveProfile(prisma, candidate.email, fixture.role, fixture.level);

    const admin = await signUpWithEmail(app, uniqueEmail());
    adminCookie = admin.cookie;
    await setUserRole(prisma, { email: admin.email, role: "admin", actor: { type: "system" } });
  });

  afterAll(async () => {
    await removeContent(prisma, fixture);
    await app.close();
  });

  /** The candidate GET routes, exactly as the API publishes them. */
  const exercisers = (): Record<string, () => request.Test> => ({
    "/api/content/career-roles": () =>
      http().get("/api/content/career-roles").set("cookie", candidateCookie),
    "/api/content/track": () => http().get("/api/content/track").set("cookie", candidateCookie),
    "/api/content/practice": () =>
      http().get("/api/content/practice").set("cookie", candidateCookie),
    "/api/content/lessons/{slug}": () =>
      http().get(`/api/content/lessons/${fixture.lessonSlug}`).set("cookie", candidateCookie),
  });

  it("has an answer key to leak in the first place", async () => {
    expect(fixture.answerKeyMarkers.length).toBeGreaterThanOrEqual(12);

    // The admin API returns it, so the markers are real, stored, and reachable over HTTP.
    const response = await http()
      .get(`/api/admin/content/questions/${fixture.questionId}`)
      .set("cookie", adminCookie);
    expect(response.status).toBe(200);
    for (const marker of fixture.answerKeyMarkers) {
      expect(JSON.stringify(response.body)).toContain(marker);
    }
  });

  it("covers every candidate route the API publishes, by any method", () => {
    const document = createOpenApiDocument(app);
    /*
     * Deliberately not `startsWith("/api/content/")` with a trailing slash, and deliberately not
     * `item.get` alone: `@Get()` with no path segment publishes `/api/content` exactly, and a
     * `@Post("practice/search")` returning questions would be just as much a candidate payload.
     * Either would have slipped past a narrower filter without failing anything.
     */
    const published = Object.entries(document.paths)
      .filter(
        ([path, item]) =>
          (path === "/api/content" || path.startsWith("/api/content/")) &&
          Boolean(item && Object.keys(item).length > 0),
      )
      .map(([path]) => path)
      .sort();
    expect(published.length).toBeGreaterThan(0);
    // A new candidate endpoint fails here until it is exercised below. That is the point.
    expect(Object.keys(exercisers()).sort()).toEqual(published);
  });

  /*
   * The guarantee this file proves stops at the `/api/content` prefix. From M3 the interview
   * engine serves question prompts from its own module (`/api/sessions/...`), and nothing here
   * will notice if one of those responses carries an answer key. Widening the filter to "every
   * route a candidate-role cookie can reach" is the job of whichever milestone adds the first
   * such route — see the M2 handover.
   */

  it.each(Object.entries(exercisers()))(
    "%s returns content and no answer key",
    async (_path, get) => {
      const response = await get();
      expect(response.status).toBe(200);
      expect(answerKeyLeaks(response.body, fixture.answerKeyMarkers)).toEqual([]);
    },
  );

  it("returns the content a candidate is supposed to see", async () => {
    const [track, practice, lesson] = await Promise.all([
      http().get("/api/content/track").set("cookie", candidateCookie),
      http().get("/api/content/practice").set("cookie", candidateCookie),
      http().get(`/api/content/lessons/${fixture.lessonSlug}`).set("cookie", candidateCookie),
    ]);
    // Without this, "no answer key found" could simply mean "nothing came back".
    expect(JSON.stringify(track.body)).toContain(fixture.visibleMarkers.trackTitle);
    expect(JSON.stringify(practice.body)).toContain(fixture.visibleMarkers.prompt);
    // Read from the parsed body: the lesson is markdown, and JSON escapes its newlines.
    expect((lesson.body as { body: string }).body).toContain(fixture.visibleMarkers.lessonBody);
  });

  describe("the detector itself", () => {
    it("objects to the admin response, which legitimately carries the answer key", async () => {
      const response = await http()
        .get(`/api/admin/content/questions/${fixture.questionId}`)
        .set("cookie", adminCookie);
      const leaks = answerKeyLeaks(response.body, fixture.answerKeyMarkers);
      expect(leaks).toContain(`answer-key text ${fixture.answerKeyMarkers[0]}`);
      expect(leaks.some((leak) => leak.startsWith("answer-key field"))).toBe(true);
    });

    it("objects to a candidate response with a rubric grafted onto it", async () => {
      const practice = await http().get("/api/content/practice").set("cookie", candidateCookie);
      const admin = await http()
        .get(`/api/admin/content/questions/${fixture.questionId}`)
        .set("cookie", adminCookie);
      const body = practice.body as { items: Record<string, unknown>[] };
      const item = body.items[0];
      expect(item).toBeDefined();

      // What a careless `.extend()` on the candidate schema would produce.
      const leaky = {
        items: [{ ...item, rubric: (admin.body as { rubric: unknown }).rubric }, ...body.items],
      };
      expect(answerKeyLeaks(leaky, fixture.answerKeyMarkers).length).toBeGreaterThan(0);
      // ...and the untouched response it was built from is still clean.
      expect(answerKeyLeaks(body, fixture.answerKeyMarkers)).toEqual([]);
    });
  });
});

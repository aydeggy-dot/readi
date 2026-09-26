import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { createOpenApiDocument } from "../src/openapi";
import { answerKeyLeaks } from "./answer-key";
import { FakeAiWorker } from "./fake-ai-worker";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";
import { framesOf } from "./sse";

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
  let candidateUserId: string;
  /** A session with one question reached, so the interview routes have something to leak. */
  let sessionId: string;
  /**
   * A second candidate, for the routes that advance a session.
   *
   * `POST /api/interviews` is one of the exercisers, and starting an interview abandons whatever
   * that candidate had running (one live interview each). The advance route would then be exercised
   * against a session that had been ended out from under it — a 409, and a test passing because it
   * found no answer key in an error body.
   */
  let liveCookie: string;
  let liveUserId: string;
  let liveSessionId: string;
  const worker = new FakeAiWorker();

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ overrides: [[AiWorkerClient, worker]] });
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);

    const candidate = await signUpWithEmail(app, uniqueEmail());
    candidateCookie = candidate.cookie;
    candidateUserId = await giveProfile(prisma, candidate.email, fixture.role, fixture.level);

    /*
     * An interview against the same fixture. Its pinned snapshot holds the whole answer key — the
     * rubric, the ideal points and the planned follow-ups — which is what gives the routes below
     * something to leak. One question is marked as reached, because an unasked question is not in
     * the candidate's view at all and a clean response would then prove nothing.
     */
    const started = await http()
      .post("/api/interviews")
      .set("cookie", candidateCookie)
      .send({ minutes: 15 });
    if (started.status !== 201) throw new Error(`could not start an interview: ${started.text}`);
    sessionId = (started.body as { id: string }).id;
    // Advanced for real rather than by setting `asked_at` behind the API's back: the stream is one
    // of the surfaces under test, and it only carries anything once the engine has spoken.
    const opening = await http()
      .post(`/api/interviews/${sessionId}/advance`)
      .set("cookie", candidateCookie)
      .send({ action: "start" });
    if (opening.status !== 200) throw new Error(`could not open the interview: ${opening.text}`);

    const live = await signUpWithEmail(app, uniqueEmail());
    liveCookie = live.cookie;
    liveUserId = await giveProfile(prisma, live.email, fixture.role, fixture.level);
    const second = await http()
      .post("/api/interviews")
      .set("cookie", liveCookie)
      .send({ minutes: 15 });
    if (second.status !== 201) throw new Error(`could not start an interview: ${second.text}`);
    liveSessionId = (second.body as { id: string }).id;
    const opened = await http()
      .post(`/api/interviews/${liveSessionId}/advance`)
      .set("cookie", liveCookie)
      .send({ action: "start" });
    if (opened.status !== 200) throw new Error(`could not open the interview: ${opened.text}`);

    const admin = await signUpWithEmail(app, uniqueEmail());
    adminCookie = admin.cookie;
    await setUserRole(prisma, { email: admin.email, role: "admin", actor: { type: "system" } });
  });

  afterAll(async () => {
    await prisma.interviewSession.deleteMany({
      where: { userId: { in: [candidateUserId, liveUserId] } },
    });
    await removeContent(prisma, fixture);
    await app.close();
  });

  /**
   * Every candidate route, exactly as the API publishes it — a **list** per path, because one path
   * can publish several methods and `POST /api/interviews` returns a session just as surely as
   * `GET /api/interviews/{id}` does.
   */
  const exercisers = (): Record<string, (() => request.Test)[]> => ({
    "/api/content/career-roles": [
      () => http().get("/api/content/career-roles").set("cookie", candidateCookie),
    ],
    "/api/content/track": [() => http().get("/api/content/track").set("cookie", candidateCookie)],
    "/api/content/practice": [
      () => http().get("/api/content/practice").set("cookie", candidateCookie),
    ],
    "/api/content/lessons/{slug}": [
      () => http().get(`/api/content/lessons/${fixture.lessonSlug}`).set("cookie", candidateCookie),
    ],
    "/api/interviews": [
      () => http().get("/api/interviews").set("cookie", candidateCookie),
      () => http().post("/api/interviews").set("cookie", candidateCookie).send({ minutes: 15 }),
    ],
    "/api/interviews/{id}": [
      () => http().get(`/api/interviews/${sessionId}`).set("cookie", candidateCookie),
    ],
    "/api/interviews/{id}/advance": [
      () =>
        http()
          .post(`/api/interviews/${liveSessionId}/advance`)
          .set("cookie", liveCookie)
          .send({ action: "answer", text: "I would start by reproducing it." }),
    ],
    "/api/interviews/{id}/status": [
      () => http().get(`/api/interviews/${liveSessionId}/status`).set("cookie", liveCookie),
    ],
  });

  /**
   * What to run the detector over. An event stream is not JSON, so `response.body` is `{}` for it —
   * which would pass this test for the worst possible reason. The frames are parsed out instead, and
   * the control below proves that parsing can still catch a leak.
   */
  const payloadOf = (response: request.Response): unknown =>
    String(response.headers["content-type"] ?? "").includes("text/event-stream")
      ? framesOf(response.text)
      : response.body;

  it("has an answer key to leak in the first place", async () => {
    expect(fixture.answerKeyMarkers.length).toBeGreaterThanOrEqual(12);
    expect(fixture.plannedFollowUpMarkers.length).toBeGreaterThan(0);

    // The admin API returns it, so the markers are real, stored, and reachable over HTTP.
    const response = await http()
      .get(`/api/admin/content/questions/${fixture.questionId}`)
      .set("cookie", adminCookie);
    expect(response.status).toBe(200);
    for (const marker of fixture.answerKeyMarkers) {
      expect(JSON.stringify(response.body)).toContain(marker);
    }
  });

  it("has an answer key pinned behind the interview routes too", async () => {
    // The same control for the second surface: the session's snapshot holds the whole key, so a
    // clean interview response below means something (M2 phase 2 lesson).
    const pinned = await prisma.interviewSessionQuestion.findMany({ where: { sessionId } });
    const raw = JSON.stringify(pinned.map((row) => row.snapshot));
    for (const marker of fixture.answerKeyMarkers) expect(raw).toContain(marker);
    for (const marker of fixture.plannedFollowUpMarkers) expect(raw).toContain(marker);
  });

  it("covers every candidate route the API publishes, by any method", () => {
    const document = createOpenApiDocument(app);
    /*
     * Deliberately not `startsWith("/api/content/")` with a trailing slash, and deliberately not
     * `item.get` alone: `@Get()` with no path segment publishes `/api/content` exactly, and a
     * `@Post("practice/search")` returning questions would be just as much a candidate payload.
     * Either would have slipped past a narrower filter without failing anything.
     */
    const prefixes = ["/api/content", "/api/interviews"];
    const published = Object.entries(document.paths)
      .filter(
        ([path, item]) =>
          prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) &&
          Boolean(item && Object.keys(item).length > 0),
      )
      .map(([path]) => path)
      .sort();
    expect(published.length).toBeGreaterThan(0);
    // A new candidate endpoint fails here until it is exercised below. That is the point.
    expect(Object.keys(exercisers()).sort()).toEqual(published);
  });

  /*
   * M3 widened this from `/api/content` to the interview routes as well, which is what the note
   * here used to say somebody would have to do. The interview surface is the more dangerous of the
   * two: a session's pinned `snapshot` holds the rubric, the ideal points **and** the planned
   * follow-ups, all in one column that three different responses are built from.
   *
   * The prefix list is still a list. The next module that serves a candidate anything derived from
   * content belongs in it, and the coverage test above is what will say so.
   */

  it.each(
    Object.entries(exercisers()).flatMap(([path, calls]) =>
      calls.map((call, index) => [`${path} [${index}]`, call] as const),
    ),
  )("%s returns content and no answer key", async (_path, call) => {
    const response = await call();
    expect([200, 201]).toContain(response.status);
    expect(answerKeyLeaks(payloadOf(response), fixture.answerKeyMarkers)).toEqual([]);
  });

  /**
   * **The one part of the answer key with a moment when it is allowed out.**
   *
   * A planned follow-up tells a candidate what they are about to be asked — right up until the
   * interviewer asks it, at which point they hear it by definition. M3 phase 3 is where a route
   * first speaks one, so the rule cannot stay "never, anywhere" without being false.
   *
   * It is narrowed rather than dropped: a probe may appear inside the `text` of a turn the
   * interviewer has spoken, and nowhere else in any payload. That is a **stronger** claim than the
   * old one over the surfaces that never speak — a probe in a question's setup, in an unreached
   * question or in a state frame still fails here, and only the one place it belongs does not.
   */
  it.each(
    Object.entries(exercisers()).flatMap(([path, calls]) =>
      calls.map((call, index) => [`${path} [${index}]`, call] as const),
    ),
  )("%s carries a planned follow-up only where an interviewer spoke it", async (_path, call) => {
    const response = await call();
    const payload = payloadOf(response);
    for (const marker of fixture.plannedFollowUpMarkers) {
      const everywhere = countOf(JSON.stringify(payload) ?? "", marker);
      const spoken = spokenTexts(payload).reduce((total, text) => total + countOf(text, marker), 0);
      expect(everywhere, `${marker} appears outside a spoken turn`).toBe(spoken);
    }
  });

  it("would catch an answer key hidden in a stream, not only in a JSON body", () => {
    // The negative control for the new surface. Without it, "no leak found in the stream" could
    // just mean "nobody looked inside an event stream".
    const leaking = [
      `data: ${JSON.stringify({ type: "turn", turn: { text: fixture.answerKeyMarkers[0] } })}`,
      "",
    ].join("\n\n");
    expect(answerKeyLeaks(framesOf(leaking), fixture.answerKeyMarkers)).not.toEqual([]);
  });

  it("returns the content a candidate is supposed to see", async () => {
    const [track, practice, lesson, roles] = await Promise.all([
      http().get("/api/content/track").set("cookie", candidateCookie),
      http().get("/api/content/practice").set("cookie", candidateCookie),
      http().get(`/api/content/lessons/${fixture.lessonSlug}`).set("cookie", candidateCookie),
      http().get("/api/content/career-roles").set("cookie", candidateCookie),
    ]);
    // Without this, "no answer key found" could simply mean "nothing came back".
    expect(JSON.stringify(track.body)).toContain(fixture.visibleMarkers.trackTitle);
    expect(JSON.stringify(practice.body)).toContain(fixture.visibleMarkers.prompt);
    // Read from the parsed body: the lesson is markdown, and JSON escapes its newlines.
    expect((lesson.body as { body: string }).body).toContain(fixture.visibleMarkers.lessonBody);
    /*
     * The catalogue route needed this most: its payload contains nothing an answer-key marker
     * could ever land in, so "no leak" was true of an empty response too, and `level_options` was
     * named to stay clear of the field-name half of the detector. Asserting the role, its level
     * and its variant come back is what makes exercising the route mean something
     * (M2.5 review, 2026-09-22).
     */
    const catalogue = roles.body as {
      roles: {
        slug: string;
        name: string;
        level_options: { slug: string }[];
        stacks: { slug: string }[];
      }[];
    };
    const mine = catalogue.roles.find((role) => role.slug === fixture.catalogue.roleSlug);
    expect(mine?.name).toBe(fixture.catalogue.roleName);
    expect(mine?.level_options.map((option) => option.slug)).toContain(fixture.catalogue.levelSlug);
    expect(mine?.stacks.map((option) => option.slug)).toContain(fixture.catalogue.stackSlug);
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

/** How many times `marker` appears in `text`. */
function countOf(text: string, marker: string): number {
  return text.split(marker).length - 1;
}

/**
 * Every string an interviewer is recorded as having said in a payload — the `text` of a transcript
 * turn, whether it arrived as `turns[]` on a session or as a `turn` frame on the stream.
 *
 * Deliberately narrow: it reads only `text` on an object that also has a `speaker`, so a probe
 * smuggled into a question's `context`, an unreached question's `prompt` or anywhere else is not
 * excused by this.
 */
function spokenTexts(payload: unknown): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (record.speaker === "interviewer" && typeof record.text === "string")
      found.push(record.text);
    Object.values(record).forEach(walk);
  };
  walk(payload);
  return found;
}

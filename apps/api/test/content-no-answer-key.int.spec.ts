import type { NestExpressApplication } from "@nestjs/platform-express";
import type { SessionReportResponse } from "@readi/shared-types";
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
import { FakeVoiceRoom } from "./fake-voice-room";
import {
  createTestApp,
  grantConsent,
  signUpWithEmail,
  uniqueEmail,
  viaService,
  VOICE_ENV,
} from "./helpers";
import { pollFor } from "./poll";
import { framesOf } from "./sse";
import { VOICE_ROOM } from "../src/voice/voice-room";

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
 *
 * **M5 extends it to the room** (ADR-0019 §4). A voice interview puts a candidate into a LiveKit room,
 * and room metadata and data channels are readable by participants — so a probe that reached either
 * would be the answer key in the candidate's own browser. `FakeVoiceRoom` records every payload the API
 * hands the media server and the detector runs over all of it; the dispatch is asserted to carry the
 * session id and nothing else. The worker's own channel is the mirror image and is asserted as such:
 * `/api/internal/interviews/:id/voice-session` **must** carry the planned follow-ups, because that is
 * what it is for, and must still carry no rubric.
 *
 * **Two routes now have a narrowed rule rather than the blanket one**, and both are narrowings in the
 * same shape: not "never", but "only at the moment it stops being a secret", asserted as a count.
 * `/advance` may speak a planned follow-up, because a probe the interviewer has asked is a probe the
 * candidate has heard (M3 phase 3). And a **scored** session's `/report` shows that session's pinned
 * ideal points and its criteria's dimension names, because the session has already been scored
 * (M4 phase 4, owner's decisions 4–5 of 2026-09-26). Everything else — the criterion descriptions, the
 * weights, the five level descriptors — is still absent from every candidate payload, and the report's
 * own tests assert each of those three claims separately.
 */

/**
 * The one route with a narrowed rule rather than the blanket one, and the three field names it is
 * allowed. See "the report of a scored session" below.
 */
const REPORT = "/api/interviews/{id}/report";
const REPORT_FIELDS = ["criteria", "criteria_total", "criteria_volunteered"] as const;

/**
 * The two field names the **worker's** bundle is allowed, and no others (M5, ADR-0019 §4).
 *
 * Both are numbers, not prose: `criterion_count` is how many criteria a question has, so the engine
 * knows how many probes are still worth asking, and a probe's `criterion` is its position in the rubric,
 * which is what lets the transcript say which criterion was prompted. The marker half of the detector
 * runs under this allowance, so a criterion's actual words arriving in either still fails.
 */
const BUNDLE_FIELDS = ["criterion_count", "criterion"] as const;

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
  /**
   * A third candidate, whose interview is finished **and scored**, because the report route is the one
   * candidate surface that carries part of the answer key and there is nothing to check until a report
   * exists. It is run and scored for real, through the engine and the real queue: a report assembled by
   * hand would prove only that the fixture was built carefully.
   */
  let scoredCookie: string;
  let scoredUserId: string;
  let scoredSessionId: string;
  /**
   * A fourth candidate, in **voice** mode, with `audio_processing` granted — because a voice token
   * cannot be issued without all three (M5 phase 4) and the room is now one of the surfaces under test.
   * Their session is advanced like the others, so the internal bundle route has a reached question.
   */
  let voiceCookie: string;
  let voiceUserId: string;
  let voiceSessionId: string;
  const worker = new FakeAiWorker();
  const room = new FakeVoiceRoom();

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      // Voice on, and a recording stand-in for LiveKit: nothing here reaches a media server, and what
      // would have been sent to one is kept for the assertions in "the room" below.
      env: VOICE_ENV,
      overrides: [
        [AiWorkerClient, worker],
        [VOICE_ROOM, room],
      ],
    });
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

    const scored = await signUpWithEmail(app, uniqueEmail());
    scoredCookie = scored.cookie;
    scoredUserId = await giveProfile(prisma, scored.email, fixture.role, fixture.level);
    scoredSessionId = await runAndScore(scoredCookie);

    const voice = await signUpWithEmail(app, uniqueEmail());
    voiceCookie = voice.cookie;
    voiceUserId = await giveProfile(prisma, voice.email, fixture.role, fixture.level);
    await grantConsent(prisma, voiceUserId, "audio_processing");
    const spoken = await http()
      .post("/api/interviews")
      .set("cookie", voiceCookie)
      .send({ minutes: 15, mode: "voice" });
    if (spoken.status !== 201) throw new Error(`could not start a voice interview: ${spoken.text}`);
    voiceSessionId = (spoken.body as { id: string }).id;
    const heard = await http()
      .post(`/api/interviews/${voiceSessionId}/advance`)
      .set("cookie", voiceCookie)
      .send({ action: "start" });
    if (heard.status !== 200) throw new Error(`could not open the interview: ${heard.text}`);

    const admin = await signUpWithEmail(app, uniqueEmail());
    adminCookie = admin.cookie;
    await setUserRole(prisma, { email: admin.email, role: "admin", actor: { type: "system" } });
  });

  /**
   * One interview, answered to the end, then waited on until its report exists.
   *
   * The fixture publishes one question carrying one planned probe, so the engine asks it, follows it
   * up once and wraps up on the second answer. The wait is a poll of the route itself, which also
   * exercises its 409 on the way past.
   */
  async function runAndScore(cookie: string): Promise<string> {
    const created = await http()
      .post("/api/interviews")
      .set("cookie", cookie)
      .send({ minutes: 15 });
    if (created.status !== 201) throw new Error(`could not start an interview: ${created.text}`);
    const id = (created.body as { id: string }).id;
    for (const body of [
      { action: "start" },
      {
        action: "answer",
        text: "I counted the queries one request made before changing anything.",
      },
      { action: "answer", text: "I would load the relation up front, so it is one query." },
    ]) {
      const advanced = await http()
        .post(`/api/interviews/${id}/advance`)
        .set("cookie", cookie)
        .send(body);
      if (advanced.status !== 200) throw new Error(`advancing failed: ${advanced.text}`);
    }
    return pollFor(`no report for session ${id}`, async () => {
      const response = await http().get(`/api/interviews/${id}/report`).set("cookie", cookie);
      if (response.status === 200) return id;
      // 409 is `report_not_ready`, which is the ordinary answer while the job runs. Anything else is
      // the route answering the wrong thing, and waiting for it to stop would prove nothing.
      if (response.status !== 409) throw new Error(`report failed: ${response.status}`);
      return null;
    });
  }

  afterAll(async () => {
    /*
     * Every step is guarded on what `beforeAll` actually reached, because when it does **not** reach
     * the end this hook is what somebody reads first — and an unguarded one buries the real failure.
     * Caught on 2026-09-28: a Postgres connection timeout in `beforeAll` (six package suites at once
     * on six cores) left the three ids `undefined`, so `in: [undefined, undefined, undefined]` threw
     * `PrismaClientValidationError` and that is what the log showed. Two errors, and the loud one was
     * a consequence of the quiet one. `docs/progress/2026-09-28-flaky-test-hunt.md`.
     */
    const userIds = [candidateUserId, liveUserId, scoredUserId, voiceUserId].filter(
      (id): id is string => id !== undefined,
    );
    if (userIds.length > 0) {
      await prisma.interviewSession.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (fixture !== undefined) await removeContent(prisma, fixture);
    await app?.close();
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
    "/api/interviews/{id}/report": [
      () => http().get(`/api/interviews/${scoredSessionId}/report`).set("cookie", scoredCookie),
    ],
    "/api/interviews/{id}/voice-token": [
      () => http().post(`/api/interviews/${voiceSessionId}/voice-token`).set("cookie", voiceCookie),
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
    Object.entries(exercisers())
      .filter(([path]) => path !== REPORT)
      .flatMap(([path, calls]) =>
        calls.map((call, index) => [`${path} [${index}]`, call] as const),
      ),
  )("%s returns content and no answer key", async (_path, call) => {
    const response = await call();
    expect([200, 201]).toContain(response.status);
    expect(answerKeyLeaks(payloadOf(response), fixture.answerKeyMarkers)).toEqual([]);
  });

  /**
   * **The report is the second surface with a moment when part of the answer key is allowed out**, and
   * like the first it is narrowed rather than excused.
   *
   * A session that has been scored shows the candidate its questions' pinned `ideal_points` as "what a
   * strong answer covers" (spec §4.4, owner's decision 4) and its criteria's `dimension` names as the
   * vocabulary the feedback is written in (decision 5). Everything else stays behind the wall: the
   * criterion descriptions, the weights, and all five level descriptors — the answer key in the form
   * that would teach a candidate what sentence to say rather than what to think about.
   *
   * So this asserts three separate things, because any one of them alone would pass for the wrong
   * reason:
   *
   * 1. the unconditional part of the key — everything except those two subsets — is absent;
   * 2. the ideal points appear as a **count**, exactly as many times as `strong_answer_covers` carries
   *    them, so one smuggled into a `reasoning` string or a second question's payload fails;
   * 3. the dimensions appear only as a `dimension` on a criterion, and nowhere else.
   */
  describe("the report of a scored session", () => {
    const report = () =>
      http().get(`/api/interviews/${scoredSessionId}/report`).set("cookie", scoredCookie);

    /** The key minus the two subsets a scored report is allowed to carry. */
    const unconditional = (): string[] => {
      const allowed = new Set([...fixture.idealPointMarkers, ...fixture.dimensionMarkers]);
      return fixture.answerKeyMarkers.filter((marker) => !allowed.has(marker));
    };

    it("has both subsets, and they are a real subset of the key", () => {
      // Without this the assertions below could be subtracting nothing from nothing.
      expect(fixture.idealPointMarkers.length).toBeGreaterThan(0);
      expect(fixture.dimensionMarkers.length).toBeGreaterThan(0);
      for (const marker of [...fixture.idealPointMarkers, ...fixture.dimensionMarkers]) {
        expect(fixture.answerKeyMarkers).toContain(marker);
      }
      expect(unconditional().length).toBeGreaterThanOrEqual(10);
    });

    it("carries no criterion description, weight or level descriptor", async () => {
      const response = await report();
      expect(response.status).toBe(200);
      expect(answerKeyLeaks(response.body, unconditional(), { allowKeys: REPORT_FIELDS })).toEqual(
        [],
      );
    });

    it("carries the pinned ideal points exactly as many times as it shows them", async () => {
      const response = await report();
      const body = response.body as SessionReportResponse;
      const shown = body.questions.flatMap((question) => question.strong_answer_covers);
      // The one part of the key this route exists to hand over, so it must really be here.
      expect(shown.length).toBe(fixture.idealPointMarkers.length);
      const raw = JSON.stringify(body);
      for (const marker of fixture.idealPointMarkers) {
        expect(countOf(raw, marker), `${marker} appears somewhere it was not shown`).toBe(
          shown.filter((point) => point === marker).length,
        );
      }
    });

    it("carries a dimension name only as a criterion's dimension", async () => {
      const response = await report();
      const body = response.body as SessionReportResponse;
      // Both lists, because a criterion is in exactly one of them: `criteria` when it was scored, and
      // `not_assessed` when the interview never got to ask about it (owner's decision, 2026-09-27).
      // Counting only the first would fail the day a report legitimately carries the second, which is
      // a fairness fix rather than a leak — and the count is still exact, so a dimension smuggled into
      // a `reasoning` string is still caught.
      const dimensions = body.questions.flatMap((question) => [
        ...question.criteria.map((criterion) => criterion.dimension),
        ...question.not_assessed,
      ]);
      expect(dimensions.length).toBeGreaterThan(0);
      const raw = JSON.stringify(body);
      for (const marker of fixture.dimensionMarkers) {
        expect(countOf(raw, marker), `${marker} appears outside a criterion's dimension`).toBe(
          dimensions.filter((dimension) => dimension === marker).length,
        );
      }
    });

    it("would still object if the report grew a rubric, allowance or no allowance", async () => {
      // The control for the allowance itself. `allowKeys` lets three key names through and nothing
      // else, and the text half of the detector keeps running underneath it — so a payload that
      // really does carry the key still fails with the allowance in place.
      const response = await report();
      const admin = await http()
        .get(`/api/admin/content/questions/${fixture.questionId}`)
        .set("cookie", adminCookie);
      const leaky = {
        ...(response.body as object),
        rubric: (admin.body as { rubric: unknown }).rubric,
      };
      expect(
        answerKeyLeaks(leaky, unconditional(), { allowKeys: REPORT_FIELDS }).length,
      ).toBeGreaterThan(0);
      // ...and the allowance is doing something rather than decorating: without it the real report
      // fails on its own `criteria` list.
      expect(answerKeyLeaks(response.body, unconditional()).length).toBeGreaterThan(0);
    });
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

  /**
   * **The room** (M5 phase 4, ADR-0019 §4).
   *
   * A voice interview puts the candidate into a LiveKit room. Room metadata, participant metadata and
   * data channels are all readable by participants, and `planned_follow_ups` are answer key — so the
   * rule is that the dispatch carries the **session id and nothing else**, and the agent pulls the
   * bundle over the service-token channel instead.
   *
   * Checked over everything the API handed the media server rather than over a list of fields somebody
   * remembered, so a metadata field added later is covered without this test being touched.
   */
  describe("the room", () => {
    it("was asked for a room and an interviewer when the token was issued", async () => {
      room.reset();
      const response = await http()
        .post(`/api/interviews/${voiceSessionId}/voice-token`)
        .set("cookie", voiceCookie);
      expect(response.status).toBe(201);
      // Without this the assertions below would pass on an empty recording, which is the one way this
      // check can look thorough and prove nothing.
      expect(room.joins).toHaveLength(1);
      expect(room.dispatches).toHaveLength(1);
    });

    it("carries no answer key into anything a participant can read", () => {
      expect(answerKeyLeaks(room.payloads(), fixture.answerKeyMarkers)).toEqual([]);
      for (const marker of fixture.plannedFollowUpMarkers) {
        expect(countOf(JSON.stringify(room.payloads()) ?? "", marker)).toBe(0);
      }
    });

    it("tells the interviewer which session it is, and nothing else at all", () => {
      const dispatch = room.dispatches[0];
      expect(dispatch).toBeDefined();
      // An exact key list rather than a check on `sessionId`: the claim is that the dispatch says one
      // thing, so a second field added to `DispatchRequest` has to be argued for here.
      expect(Object.keys(dispatch ?? {}).sort()).toEqual(["room", "sessionId"]);
      expect(dispatch?.sessionId).toBe(voiceSessionId);
    });

    it("identifies the candidate by their session, never by their account or their name", async () => {
      const join = room.joins[0];
      const user = await prisma.user.findUniqueOrThrow({ where: { id: voiceUserId } });
      const raw = JSON.stringify(room.payloads()) ?? "";
      /*
       * A room name and a participant identity are visible to everyone in the room and appear in
       * LiveKit's own logs and dashboards. A session id leads nowhere without our database; a user id
       * would link every room that candidate has ever been in, and an email or a name would be the
       * candidate themselves. So both are derived from the session.
       */
      expect(join?.room).toContain(voiceSessionId);
      expect(join?.identity).toContain(voiceSessionId);
      expect(raw).not.toContain(voiceUserId);
      expect(raw).not.toContain(user.email);
      expect(raw).not.toContain(user.name);
    });
  });

  /**
   * **The worker's own channel is the mirror image of every assertion above**, and it is asserted
   * rather than assumed.
   *
   * `/api/internal/interviews/:id/voice-session` is the one route in the API that hands part of the
   * answer key to another process, because the agent cannot ask a question it has not been given. What
   * it hands over is `BundleQuestion`: the prompt, the context and the probes, and **no rubric, no
   * criteria, no weights, no descriptors and no ideal points**. Both halves are checked — the positive
   * one because a bundle that quietly stopped carrying its probes would break follow-ups everywhere and
   * fail nothing here, and the negative one because that wall is `session-bundle.ts`'s whole job.
   *
   * These routes are excluded from the OpenAPI document, so the coverage test above cannot enumerate
   * them; the last test in this block is what stops that exclusion from being silently reversed.
   */
  describe("the worker's own channel", () => {
    const bundle = () =>
      http().get(`/api/internal/interviews/${voiceSessionId}/voice-session`).set(viaService());

    it("hands the agent the probes, because that is what it is for", async () => {
      const response = await bundle();
      expect(response.status).toBe(200);
      const raw = JSON.stringify(response.body) ?? "";
      for (const marker of fixture.plannedFollowUpMarkers) expect(raw).toContain(marker);
    });

    it("hands the agent no rubric, no criterion and no ideal point", async () => {
      const response = await bundle();
      // Everything but the probes: those are legitimately here and are counted by the test above.
      const key = fixture.answerKeyMarkers.filter(
        (marker) => !fixture.plannedFollowUpMarkers.includes(marker),
      );
      expect(key.length).toBeGreaterThanOrEqual(12);
      /*
       * Two allowed field **names**, and both are numbers rather than answer key. `criterion_count` is
       * how many criteria a question has, which the engine needs to know how many probes it may still
       * usefully ask; `planned_follow_ups[].criterion` is a probe's *position* in the rubric, which is
       * what lets `session_turns.follow_up_index` say which criterion was prompted (M4's 0.85). Neither
       * carries a word of the rubric, and the marker half of the detector runs regardless — so a
       * criterion's description arriving in either would still fail here.
       */
      expect(answerKeyLeaks(response.body, key, { allowKeys: BUNDLE_FIELDS })).toEqual([]);
    });

    it("would still catch a rubric grafted into the bundle", async () => {
      const response = await bundle();
      const key = fixture.answerKeyMarkers.filter(
        (marker) => !fixture.plannedFollowUpMarkers.includes(marker),
      );
      // The control for the allowance above: the two allowed names must not have widened the check.
      const leaky = { ...(response.body as object), rubric: { criteria: key } };
      expect(answerKeyLeaks(leaky, key, { allowKeys: BUNDLE_FIELDS })).not.toEqual([]);
    });

    it("is refused without the service token, and by a signed-in candidate", async () => {
      const anonymous = await http().get(
        `/api/internal/interviews/${voiceSessionId}/voice-session`,
      );
      expect(anonymous.status).toBe(401);
      // A candidate's own session cookie is not a way in either: `@ServiceOnly()` is more restricted
      // than signed-in, not less, so the answer key is not one cookie away from its owner.
      const candidate = await http()
        .get(`/api/internal/interviews/${voiceSessionId}/voice-session`)
        .set("cookie", voiceCookie);
      expect(candidate.status).toBe(401);
    });

    it("publishes no internal path, so the coverage test above is not quietly narrowed", () => {
      const document = createOpenApiDocument(app);
      /*
       * `@ApiExcludeController()` keeps the three internal routes out of the browser's generated client
       * (ADR-0012), which also keeps them out of the prefix enumeration above. That is the right trade
       * — they carry the key on purpose and are asserted here by hand — but it is exactly the shape of
       * an accidental hole, so removing the exclusion has to fail a test and be argued for.
       */
      const internal = Object.keys(document.paths).filter((path) =>
        path.startsWith("/api/internal"),
      );
      expect(internal).toEqual([]);
    });
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

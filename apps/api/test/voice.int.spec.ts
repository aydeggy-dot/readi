import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  type InterviewTurnPush,
  type VoiceLatencyResponse,
  type VoiceLegEndedRequest,
  type VoiceSessionLatencyResponse,
  type VoiceSessionStartResponse,
  type VoiceTokenResponse,
  VOICE_LIMITS,
} from "@readi/shared-types";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import { VOICE_ROOM } from "../src/voice/voice-room";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { FakeAiWorker } from "./fake-ai-worker";
import { FakeVoiceRoom } from "./fake-voice-room";
import {
  createTestApp,
  grantConsent,
  signUpWithEmail,
  uniqueEmail,
  viaService,
  VOICE_ENV,
} from "./helpers";

/**
 * Voice mode's API half (M5 phase 4, ADR-0019).
 *
 * Four things are under test, and they are the four things that can only be got wrong here rather than
 * in the agent:
 *
 * 1. **A token is issued only when it should be** — ownership, `audio_processing` at its current
 *    version, and the voice allowance. Each refusal carries its own `ApiError` code, because the web
 *    app has copy for each and shows none of the server's English (ADR-0012).
 * 2. **The push is idempotent and complete.** The agent retries; `voice_exchanges` is what stops a
 *    retry billing the model calls a second time, and the turns, the word timings, the barge-in facts
 *    and the latency samples all have to survive one.
 * 3. **The ledger meters once.** A leg reported twice is one row, and the minutes a candidate has used
 *    is what refuses their next token.
 * 4. **The fallback is bookkeeping, not a rewrite.** `mode` still says `voice` after a leg has fallen
 *    back to text, and the row is what says what happened.
 *
 * `VOICE_ROOM` is a recording double, so nothing here reaches LiveKit. What enters the room is asserted
 * in `content-no-answer-key.int.spec.ts`, where the answer-key fixture lives.
 */
describe("voice mode", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;
  /**
   * One shared candidate, for the tests that need a candidate's cookie but not a session of their own.
   * Everything that starts a session gets its own candidate, because six an hour is the rate limit and
   * this file needs more than six.
   */
  let cookie: string;
  let adminCookie: string;
  /** A candidate with no `audio_processing` decision at all, for the consent refusal. */
  let silentCookie: string;
  let silentUserId: string;
  const worker = new FakeAiWorker();
  const room = new FakeVoiceRoom();
  const http = () => request(app.getHttpServer());
  /** Everybody this file created, so `afterAll` can take their sessions and ledger rows with them. */
  const created: string[] = [];

  beforeAll(async () => {
    app = await createTestApp({
      env: VOICE_ENV,
      overrides: [
        [AiWorkerClient, worker],
        [VOICE_ROOM, room],
      ],
    });
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);

    cookie = (await voiceCandidate()).cookie;

    const silent = await signUpWithEmail(app, uniqueEmail());
    silentCookie = silent.cookie;
    silentUserId = await giveProfile(prisma, silent.email, fixture.role, fixture.level);
    created.push(silentUserId);

    const admin = await signUpWithEmail(app, uniqueEmail());
    adminCookie = admin.cookie;
    await setUserRole(prisma, { email: admin.email, role: "admin", actor: { type: "system" } });
  });

  afterAll(async () => {
    const userIds = created.filter((id): id is string => id !== undefined);
    if (userIds.length > 0) {
      await prisma.usageLedger.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.interviewSession.deleteMany({ where: { userId: { in: userIds } } });
    }
    if (fixture !== undefined) await removeContent(prisma, fixture);
    await app?.close();
  });

  beforeEach(() => {
    room.reset();
  });

  /** A candidate who may take a voice interview: profiled, and `audio_processing` granted. */
  async function voiceCandidate(): Promise<{ cookie: string; userId: string }> {
    const candidate = await signUpWithEmail(app, uniqueEmail());
    const id = await giveProfile(prisma, candidate.email, fixture.role, fixture.level);
    await grantConsent(prisma, id, "audio_processing");
    created.push(id);
    return { cookie: candidate.cookie, userId: id };
  }

  /**
   * A voice session, opened, so there is a question to answer — for **a candidate of its own**.
   *
   * A fresh candidate per session rather than one candidate with many, because `INTERVIEW_RATE_LIMITS`
   * allows six an hour per user and this file needs more than six. Reusing one would have made the
   * seventh test onwards fail on a 429, which is the rate limiter working and would have read as this
   * feature being broken.
   */
  async function startVoice(): Promise<{ id: string; cookie: string; userId: string }> {
    const candidate = await voiceCandidate();
    return { ...candidate, id: await openVoice(candidate.cookie) };
  }

  async function openVoice(as: string): Promise<string> {
    const session = await http()
      .post("/api/interviews")
      .set("cookie", as)
      .send({ minutes: 15, mode: "voice" });
    if (session.status !== 201) throw new Error(`could not start: ${session.text}`);
    const id = (session.body as { id: string }).id;
    const opened = await http()
      .post(`/api/interviews/${id}/advance`)
      .set("cookie", as)
      .send({ action: "start" });
    if (opened.status !== 200) throw new Error(`could not open: ${opened.text}`);
    return id;
  }

  describe("starting a voice session", () => {
    it("pins the mode, so a fallback later cannot rewrite what it was", async () => {
      const { id } = await startVoice();
      const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
      expect(row.mode).toBe("voice");
    });

    /**
     * Refused **before anything is pinned**, which is the whole reason the check is at creation as well
     * as at the token. A session pinned as `voice` that can never be joined has spent four questions of
     * this candidate's bank on nothing, and those questions then count as seen for twenty sessions.
     */
    it("is refused without consent, and nothing is written", async () => {
      const before = await prisma.interviewSession.count({ where: { userId: silentUserId } });
      const response = await http()
        .post("/api/interviews")
        .set("cookie", silentCookie)
        .send({ minutes: 15, mode: "voice" });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "voice_consent_required" });
      expect(await prisma.interviewSession.count({ where: { userId: silentUserId } })).toBe(before);
    });

    it("still lets the same candidate practise in text mode", async () => {
      const response = await http()
        .post("/api/interviews")
        .set("cookie", silentCookie)
        .send({ minutes: 15 });
      expect(response.status).toBe(201);
      expect((response.body as { mode: string }).mode).toBe("text");
    });
  });

  describe("the join token", () => {
    it("issues a short-lived token and dispatches the interviewer", async () => {
      const { id, cookie: mine } = await startVoice();
      const response = await http().post(`/api/interviews/${id}/voice-token`).set("cookie", mine);
      expect(response.status).toBe(201);
      const body = response.body as VoiceTokenResponse;
      expect(body.room).toContain(id);
      expect(body.identity).toContain(id);
      expect(body.fallback_after_poor_ms).toBe(VOICE_LIMITS.fallbackAfterPoorMs);
      // Within a second of the TTL: the point is that it is minutes rather than the session's length.
      const ttl = (new Date(body.expires_at).getTime() - Date.now()) / 1_000;
      expect(ttl).toBeGreaterThan(VOICE_LIMITS.tokenTtlSeconds - 30);
      expect(ttl).toBeLessThanOrEqual(VOICE_LIMITS.tokenTtlSeconds);
      expect(room.dispatches).toHaveLength(1);
    });

    it("is refused for a text session, because its intro said it was typed", async () => {
      const candidate = await voiceCandidate();
      const session = await http()
        .post("/api/interviews")
        .set("cookie", candidate.cookie)
        .send({ minutes: 15 });
      const id = (session.body as { id: string }).id;
      const response = await http()
        .post(`/api/interviews/${id}/voice-token`)
        .set("cookie", candidate.cookie);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "voice_not_enabled" });
      expect(room.dispatches).toHaveLength(0);
    });

    it("is another candidate's 404, not their 403", async () => {
      const { id } = await startVoice();
      const response = await http()
        .post(`/api/interviews/${id}/voice-token`)
        .set("cookie", silentCookie);
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "interview_not_found" });
    });

    /**
     * The allowance is read from the ledger, so spending it is a matter of writing a row — which is
     * also the only way this can be tested without running twenty minutes of audio.
     */
    it("is refused once the allowance is spent, and the session is left alone", async () => {
      const { id, cookie: mine, userId: mineId } = await startVoice();
      const spent = await prisma.usageLedger.create({
        data: {
          userId: mineId,
          sessionId: id,
          kind: "voice_seconds",
          quantity: 10_000_000,
          sourceId: randomUUID(),
          occurredAt: new Date(),
        },
      });
      try {
        const response = await http().post(`/api/interviews/${id}/voice-token`).set("cookie", mine);
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: "voice_allowance_exhausted" });
        const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
        expect(row.status).toBe("in_progress");
      } finally {
        await prisma.usageLedger.delete({ where: { id: spent.id } });
      }
    });

    it("refuses a session that has ended", async () => {
      const { id, cookie: mine } = await startVoice();
      await http().post(`/api/interviews/${id}/advance`).set("cookie", mine).send({
        action: "end",
      });
      const response = await http().post(`/api/interviews/${id}/voice-token`).set("cookie", mine);
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "interview_ended" });
    });

    /**
     * A reload asks for a second token and gets one, because rejoining is exactly what a reconnection
     * is: the same room, the same interviewer, a fresh token.
     *
     * That the *interviewer* is not dispatched twice is `LiveKitRoom`'s own rule — it asks LiveKit what
     * is already coming — and it is tested where it lives (`livekit-room.spec.ts`). Asserting it through
     * a recording double would only test the double.
     */
    it("issues a second token for the same room, for a reload or a reconnection", async () => {
      const { id, cookie: mine } = await startVoice();
      const first = await http().post(`/api/interviews/${id}/voice-token`).set("cookie", mine);
      const second = await http().post(`/api/interviews/${id}/voice-token`).set("cookie", mine);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect((first.body as VoiceTokenResponse).room).toBe(
        (second.body as VoiceTokenResponse).room,
      );
      expect(room.joins).toHaveLength(2);
    });
  });

  describe("the agent's own routes", () => {
    it("are refused without the service token", async () => {
      const { id } = await startVoice();
      // Built as thunks and awaited one at a time: supertest starts a listener per request, and three
      // constructed up front then awaited in sequence had the first close the server under the rest.
      const calls = [
        () => http().get(`/api/internal/interviews/${id}/voice-session`),
        () => http().post(`/api/internal/interviews/${id}/turns`).send({}),
        () => http().post(`/api/internal/interviews/${id}/voice-ended`).send({}),
      ];
      for (const call of calls) expect((await call()).status).toBe(401);
    });

    it("serve the leg everything it needs, on the API's clock", async () => {
      const { id } = await startVoice();
      const response = await http()
        .get(`/api/internal/interviews/${id}/voice-session`)
        .set(viaService());
      expect(response.status).toBe(200);
      const body = response.body as VoiceSessionStartResponse;
      expect(body.bundle.session_id).toBe(id);
      expect(body.room).toContain(id);
      // Already advanced once (the intro), so this is a second leg and the agent waits rather than
      // greeting somebody who has already been greeted.
      expect(body.resume).toBe(true);
      expect(body.engine_snapshot).not.toBeNull();
      expect(Number.isFinite(new Date(body.now).getTime())).toBe(true);
      expect(body.voice_seconds_remaining).toBeGreaterThan(0);
    });

    it("tell a first leg to greet the candidate", async () => {
      const candidate = await voiceCandidate();
      const session = await http()
        .post("/api/interviews")
        .set("cookie", candidate.cookie)
        .send({ minutes: 15, mode: "voice" });
      const id = (session.body as { id: string }).id;
      const response = await http()
        .get(`/api/internal/interviews/${id}/voice-session`)
        .set(viaService());
      expect((response.body as VoiceSessionStartResponse).resume).toBe(false);
      expect((response.body as VoiceSessionStartResponse).engine_snapshot).toBeNull();
    });

    it("answer 404 for a session that does not exist", async () => {
      const response = await http()
        .get(`/api/internal/interviews/${randomUUID()}/voice-session`)
        .set(viaService());
      expect(response.status).toBe(404);
    });
  });

  describe("pushing an exchange", () => {
    /**
     * One exchange in the shape the agent sends: the candidate's answer with its word timings, the
     * interviewer's reply with how much of it was heard, and a latency sample per reply.
     */
    async function pushFor(id: string): Promise<InterviewTurnPush> {
      const start = await http()
        .get(`/api/internal/interviews/${id}/voice-session`)
        .set(viaService());
      const leg = start.body as VoiceSessionStartResponse;
      const snapshot = leg.engine_snapshot;
      if (!snapshot) throw new Error("expected a snapshot on an opened session");
      const seq = snapshot.next_seq;
      return {
        exchange_id: randomUUID(),
        state: "follow_up",
        ended: false,
        end_reason: null,
        turns: [
          {
            seq,
            speaker: "candidate",
            state: "question",
            question_position: 0,
            follow_up_index: null,
            text: "I would reproduce it first, then measure before changing anything.",
            criteria_covered: null,
            voice: {
              words: [
                { text: "I", start_ms: 0, end_ms: 120, confidence: 0.98 },
                { text: "would", start_ms: 120, end_ms: 340, confidence: 0.97 },
              ],
              stt_confidence: 0.96,
              spoken_ms: null,
              interrupted: false,
            },
          },
          {
            seq: seq + 1,
            speaker: "interviewer",
            state: "follow_up",
            question_position: 0,
            follow_up_index: 0,
            text: "What did you measure?",
            criteria_covered: null,
            voice: { words: [], stt_confidence: null, spoken_ms: 1_400, interrupted: true },
          },
        ],
        engine_snapshot: { ...snapshot, state: "follow_up", next_seq: seq + 2 },
        prompt_versions: { interview_followup: 1 },
        ai_calls: [
          {
            purpose: "interviewer",
            provider: "fake",
            model: "fake",
            status: "ok",
            error_code: null,
            latency_ms: 900,
            input_units: 800,
            output_units: 30,
            cache_write_units: 0,
            cache_read_units: 0,
            unit_kind: "tokens",
            cost_micro_usd: 120,
            langfuse_trace_id: null,
          },
        ],
        latency: [
          {
            turn_seq: seq + 1,
            speech_ended_at: new Date().toISOString(),
            endpoint_ms: 420,
            stt_final_ms: 180,
            acknowledged_ms: 90,
            coverage_ms: 1_000,
            phrasing_ms: 850,
            tts_first_byte_ms: 260,
            response_ms: 2_100,
            prefetched: false,
            interim_coverage: false,
            interrupted: true,
          },
        ],
      };
    }

    const push = (id: string, body: InterviewTurnPush) =>
      http().post(`/api/internal/interviews/${id}/turns`).set(viaService()).send(body);

    it("stores the turns, the word timings and how much of the reply was heard", async () => {
      const { id } = await startVoice();
      const body = await pushFor(id);
      const response = await push(id, body);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ duplicate: false, ended: false, state: "follow_up" });

      const turns = await prisma.sessionTurn.findMany({
        where: { sessionId: id },
        orderBy: { seq: "asc" },
      });
      const answer = turns.find((turn) => turn.speaker === "candidate");
      expect(answer?.voiceWords).toHaveLength(2);
      expect(answer?.sttConfidence).toBeCloseTo(0.96);
      // A candidate turn has no `spoken_ms`: nobody was playing it to them.
      expect(answer?.spokenMs).toBeNull();
      const probe = turns.find((turn) => turn.followUpIndex === 0);
      expect(probe?.spokenMs).toBe(1_400);
      expect(probe?.interrupted).toBe(true);
      // An interviewer turn's own timing comes from its sample, so its length is what was spoken.
      expect((probe?.endedMs ?? 0) - (probe?.startedMs ?? 0)).toBe(1_400);
    });

    it("files a latency sample per reply", async () => {
      const { id } = await startVoice();
      await push(id, await pushFor(id));
      const samples = await prisma.voiceTurnLatency.findMany({ where: { sessionId: id } });
      expect(samples).toHaveLength(1);
      expect(samples[0]).toMatchObject({
        responseMs: 2_100,
        acknowledgedMs: 90,
        interrupted: true,
      });
    });

    /**
     * The reason `voice_exchanges` exists. The turns are already idempotent by `(session_id, seq)`
     * because the engine allocates the seqs — but `ai_call_log` has no natural key, so a retried push
     * would bill the same model calls a second time, and every cost figure downstream would be a number
     * taken on trust.
     */
    it("is safe to send twice: one set of turns, one bill, one sample", async () => {
      const { id } = await startVoice();
      const body = await pushFor(id);
      const first = await push(id, body);
      const second = await push(id, body);
      expect(first.body).toMatchObject({ duplicate: false });
      expect(second.body).toMatchObject({ duplicate: true, state: "follow_up" });

      expect(await prisma.aiCallLog.count({ where: { sessionId: id } })).toBe(
        // One from the intro exchange the browser made, one from this push. Not two from the push.
        2,
      );
      expect(await prisma.voiceTurnLatency.count({ where: { sessionId: id } })).toBe(1);
      expect(await prisma.voiceExchange.count({ where: { sessionId: id } })).toBe(1);
    });

    it("merges the prompt versions rather than replacing them", async () => {
      const { id } = await startVoice();
      await push(id, await pushFor(id));
      const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
      // The intro's versions and the follow-up's: a session records every released prompt that spoke.
      expect(row.promptVersions).toMatchObject({ interview_system: 1, interview_followup: 1 });
    });

    it("queues scoring when the exchange it pushed is the one that ended the session", async () => {
      const { id } = await startVoice();
      const body = await pushFor(id);
      const ending: InterviewTurnPush = {
        ...body,
        state: "ended",
        ended: true,
        end_reason: "questions_done",
        engine_snapshot: { ...body.engine_snapshot, state: "ended", end_reason: "questions_done" },
      };
      const response = await push(id, ending);
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ ended: true, status: "completed" });
      const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("completed");
      expect(row.endedAt).not.toBeNull();
    });
  });

  describe("ending a leg", () => {
    const report = (id: string, body: VoiceLegEndedRequest) =>
      http().post(`/api/internal/interviews/${id}/voice-ended`).set(viaService()).send(body);

    const legFor = (overrides: Partial<VoiceLegEndedRequest> = {}): VoiceLegEndedRequest => ({
      leg_id: randomUUID(),
      reason: "completed",
      voice_seconds: 480,
      turns_spoken: 7,
      quality: { rtt_ms_p50: null, rtt_ms_p95: null, packet_loss_percent: null, reconnects: 0 },
      ...overrides,
    });

    it("meters the minutes and answers with the session's total", async () => {
      const { id, userId: mine } = await startVoice();
      const response = await report(id, legFor());
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ duplicate: false, voice_seconds_total: 480 });
      const rows = await prisma.usageLedger.findMany({ where: { sessionId: id } });
      expect(rows).toHaveLength(1);
      // Metered against the candidate, not against the session alone: the allowance is theirs.
      expect(rows[0]).toMatchObject({ kind: "voice_seconds", quantity: 480, userId: mine });
    });

    it("meters a leg once however many times it is reported", async () => {
      const { id } = await startVoice();
      const leg = legFor({ voice_seconds: 300 });
      await report(id, leg);
      const again = await report(id, leg);
      expect(again.body).toMatchObject({ duplicate: true, voice_seconds_total: 300 });
      expect(await prisma.usageLedger.count({ where: { sessionId: id } })).toBe(1);
      expect(await prisma.voiceLeg.count({ where: { sessionId: id } })).toBe(1);
    });

    it("adds a second leg's minutes to the first's", async () => {
      const { id } = await startVoice();
      await report(id, legFor({ voice_seconds: 200 }));
      const second = await report(id, legFor({ voice_seconds: 100, reason: "candidate_left" }));
      expect(second.body).toMatchObject({ voice_seconds_total: 300 });
    });

    /**
     * Seconds rather than minutes, and this is the arithmetic that decided it. Three legs of forty
     * seconds is two minutes of allowance; rounding each leg up to a minute would bill three, for
     * reconnecting — which is what a Nigerian mobile connection does (spec §10's row is amended in the
     * same change).
     */
    it("does not round each leg up, so reconnecting is not charged for", async () => {
      const { id } = await startVoice();
      for (const seconds of [40, 40, 40]) await report(id, legFor({ voice_seconds: seconds }));
      const total = await prisma.usageLedger.aggregate({
        where: { sessionId: id },
        _sum: { quantity: true },
      });
      expect(total._sum.quantity).toBe(120);
    });

    it("writes no ledger row for a leg nobody joined", async () => {
      const { id } = await startVoice();
      const response = await report(
        id,
        legFor({ voice_seconds: 0, turns_spoken: 0, reason: "candidate_left" }),
      );
      expect(response.body).toMatchObject({ voice_seconds_total: 0 });
      // The leg is still recorded: a room nobody joined is a fact worth having. The ledger is not,
      // because a zero row would make "how many legs have been metered?" answer wrongly for ever.
      expect(await prisma.voiceLeg.count({ where: { sessionId: id } })).toBe(1);
      expect(await prisma.usageLedger.count({ where: { sessionId: id } })).toBe(0);
    });

    /**
     * ADR-0019 §7: a fallback is an event with a reason, not a rewrite of history. `mode` keeps meaning
     * how the session **started**, the browser resumes over SSE at the same turn, and the leg row is the
     * whole of the bookkeeping.
     */
    it("records a fallback without changing what the session was", async () => {
      const { id, cookie: mine } = await startVoice();
      await report(id, legFor({ reason: "fallback_poor_connection", voice_seconds: 95 }));
      const row = await prisma.interviewSession.findUniqueOrThrow({ where: { id } });
      expect(row.mode).toBe("voice");
      expect(row.status).toBe("in_progress");
      const legs = await prisma.voiceLeg.findMany({ where: { sessionId: id } });
      expect(legs[0]).toMatchObject({ reason: "fallback_poor_connection", voiceSeconds: 95 });

      // And the interview really does carry on, at the same turn, over the text transport.
      const advanced = await http()
        .post(`/api/interviews/${id}/advance`)
        .set("cookie", mine)
        .send({ action: "answer", text: "I would start by reproducing it." });
      expect(advanced.status).toBe(200);
    });

    it("keeps the connection summary, because it is what explains a fallback", async () => {
      const { id } = await startVoice();
      await report(
        id,
        legFor({
          reason: "fallback_poor_connection",
          quality: {
            rtt_ms_p50: 180,
            rtt_ms_p95: 900,
            packet_loss_percent: 7.5,
            reconnects: 3,
          },
        }),
      );
      const legs = await prisma.voiceLeg.findMany({ where: { sessionId: id } });
      expect(legs[0]).toMatchObject({
        rttMsP50: 180,
        rttMsP95: 900,
        packetLossPercent: 7.5,
        reconnects: 3,
      });
    });
  });

  describe("the admin latency view", () => {
    it("is not a content editor's screen, let alone a candidate's", async () => {
      expect((await http().get("/api/admin/voice/latency").set("cookie", cookie)).status).toBe(403);
      expect((await http().get("/api/admin/voice/latency")).status).toBe(401);
    });

    it("reports the spread, the legs and the two targets", async () => {
      const { id } = await startVoice();
      const body = await (async () => {
        const start = await http()
          .get(`/api/internal/interviews/${id}/voice-session`)
          .set(viaService());
        const snapshot = (start.body as VoiceSessionStartResponse).engine_snapshot;
        if (!snapshot) throw new Error("expected a snapshot");
        return snapshot;
      })();
      await http()
        .post(`/api/internal/interviews/${id}/turns`)
        .set(viaService())
        .send({
          exchange_id: randomUUID(),
          state: "follow_up",
          ended: false,
          end_reason: null,
          turns: [
            {
              seq: body.next_seq,
              speaker: "interviewer",
              state: "follow_up",
              question_position: 0,
              follow_up_index: 0,
              text: "What did you measure?",
              criteria_covered: null,
              voice: { words: [], stt_confidence: null, spoken_ms: 1_200, interrupted: false },
            },
          ],
          engine_snapshot: { ...body, state: "follow_up", next_seq: body.next_seq + 1 },
          prompt_versions: {},
          ai_calls: [],
          latency: [
            {
              turn_seq: body.next_seq,
              speech_ended_at: new Date().toISOString(),
              endpoint_ms: 400,
              stt_final_ms: 200,
              acknowledged_ms: 80,
              coverage_ms: null,
              phrasing_ms: null,
              tts_first_byte_ms: null,
              response_ms: 1_500,
              prefetched: true,
              interim_coverage: false,
              interrupted: false,
            },
          ],
        });
      await http()
        .post(`/api/internal/interviews/${id}/voice-ended`)
        .set(viaService())
        .send({
          leg_id: randomUUID(),
          reason: "completed",
          voice_seconds: 240,
          turns_spoken: 4,
          quality: {
            rtt_ms_p50: null,
            rtt_ms_p95: null,
            packet_loss_percent: null,
            reconnects: 0,
          },
        });

      const listed = await http().get("/api/admin/voice/latency").set("cookie", adminCookie);
      expect(listed.status).toBe(200);
      const page = listed.body as VoiceLatencyResponse;
      expect(page.targets).toEqual({
        first_audio_ms: VOICE_LIMITS.firstAudioTargetMs,
        response_ms: VOICE_LIMITS.responseTargetMs,
      });
      const session = page.sessions.find((row) => row.session_id === id);
      expect(session).toBeDefined();
      expect(session?.voice_seconds).toBe(240);
      expect(session?.latency.response).toMatchObject({ n: 1, p50_ms: 1_500 });
      // A prefetched opening has no phrasing call, and that is reported as absent rather than as fast.
      expect(session?.latency.phrasing).toEqual({ n: 0, p50_ms: null, p95_ms: null });
      expect(session?.legs[0]).toMatchObject({ reason: "completed", voice_seconds: 240 });

      const detail = await http().get(`/api/admin/voice/latency/${id}`).set("cookie", adminCookie);
      expect(detail.status).toBe(200);
      const turns = (detail.body as VoiceSessionLatencyResponse).turns;
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({ response_ms: 1_500, prefetched: true });
    });

    /** Aggregate about candidates, never about one: the calibration dashboard's rule again. */
    it("names no candidate", async () => {
      const { id, userId: mine } = await startVoice();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: mine } });
      const listed = await http().get("/api/admin/voice/latency").set("cookie", adminCookie);
      const raw = JSON.stringify(listed.body);
      expect(raw).toContain(id);
      expect(raw).not.toContain(mine);
      expect(raw).not.toContain(user.email);
      expect(raw).not.toContain(user.name);
    });

    it("shows a fallback for what it was", async () => {
      const { id } = await startVoice();
      await http()
        .post(`/api/internal/interviews/${id}/voice-ended`)
        .set(viaService())
        .send({
          leg_id: randomUUID(),
          reason: "fallback_poor_connection",
          voice_seconds: 60,
          turns_spoken: 1,
          quality: {
            rtt_ms_p50: null,
            rtt_ms_p95: null,
            packet_loss_percent: null,
            reconnects: 4,
          },
        });
      const listed = await http().get("/api/admin/voice/latency").set("cookie", adminCookie);
      const session = (listed.body as VoiceLatencyResponse).sessions.find(
        (row) => row.session_id === id,
      );
      expect(session?.fell_back_to_text).toBe(true);
    });
  });
});

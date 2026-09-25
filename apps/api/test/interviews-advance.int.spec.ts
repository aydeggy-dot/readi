import type { NestExpressApplication } from "@nestjs/platform-express";
import type {
  InterviewFrame,
  InterviewSessionResponse,
  InterviewStatusResponse,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { InterviewSessionsRepository } from "../src/interviews/interview-sessions.repository";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { FakeAiWorker } from "./fake-ai-worker";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";
import { framesOf } from "./sse";

/**
 * One exchange, end to end through the API (M3 phase 3, ADR-0016).
 *
 * The engine is not exercised here — it is Python and it is tested there. What is proved here is
 * the API's half: what goes on the wire, what is written down, what happens when the worker will
 * not answer, and that sending the same thing twice cannot corrupt a transcript.
 *
 * Every test that starts a session gets its own candidate: six an hour is the real limit and these
 * specs share one database (the phase-1 lesson).
 */
describe("advancing an interview", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;
  const worker = new FakeAiWorker();
  const userIds: string[] = [];

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ overrides: [[AiWorkerClient, worker]] });
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);
  });

  beforeEach(() => {
    worker.engine.outcome = "ok";
    worker.engine.requests.length = 0;
    worker.engine.responses.length = 0;
    worker.engine.forgetBundles();
  });

  afterAll(async () => {
    await prisma.interviewSession.deleteMany({ where: { userId: { in: userIds } } });
    await removeContent(prisma, fixture);
    await app.close();
  });

  async function candidate(): Promise<string> {
    const signed = await signUpWithEmail(app, uniqueEmail());
    userIds.push(await giveProfile(prisma, signed.email, fixture.role, fixture.level));
    return signed.cookie;
  }

  async function session(cookie: string): Promise<InterviewSessionResponse> {
    const started = await http()
      .post("/api/interviews")
      .set("cookie", cookie)
      .send({ minutes: 15 });
    if (started.status !== 201) {
      throw new Error(`starting an interview failed: ${started.status} ${started.text}`);
    }
    return started.body as InterviewSessionResponse;
  }

  /** One exchange. Returns the parsed frames, or throws with the status if it was refused. */
  async function advance(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): Promise<InterviewFrame[]> {
    const response = await http()
      .post(`/api/interviews/${id}/advance`)
      .set("cookie", cookie)
      .send(body);
    if (response.status !== 200) {
      throw new Error(`advancing failed: ${response.status} ${response.text}`);
    }
    return framesOf(response.text);
  }

  const refusal = (cookie: string, id: string, body: Record<string, unknown>) =>
    http().post(`/api/interviews/${id}/advance`).set("cookie", cookie).send(body);

  // -----------------------------------------------------------------------------------------

  describe("what goes on the wire", () => {
    it("streams the interviewer composing, then what it said, then where the session stands", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      const frames = await advance(cookie, started.id, { action: "start" });

      expect(frames.map((frame) => frame.type)).toEqual([
        // Sent before the worker is called, which is the whole reason this is a stream.
        "thinking",
        "turn",
        // The question's own setup material arrives BEFORE the turn that asks about it.
        "question",
        "turn",
        "state",
        "done",
      ]);
      const turns = frames.filter((frame) => frame.type === "turn");
      expect(turns[0]?.turn.state).toBe("intro");
      expect(turns[1]?.turn.state).toBe("question");
      const asked = frames.find((frame) => frame.type === "question");
      expect(asked?.question.position).toBe(0);
      expect(asked?.question.prompt.length).toBeGreaterThan(0);
      const state = frames.find((frame) => frame.type === "state");
      expect(state?.state).toBe("question");
      expect(state?.questions_asked).toBe(1);
      expect(state?.status).toBe("in_progress");
    });

    it("serves the stream as an event stream, not as a buffered body", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      const response = await http()
        .post(`/api/interviews/${started.id}/advance`)
        .set("cookie", cookie)
        .send({ action: "start" });
      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/event-stream");
      expect(response.headers["cache-control"]).toContain("no-transform");
      expect(response.headers["content-length"]).toBeUndefined();
    });

    it("never streams the answer key, not even what the engine decided with it", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      const answered = await http()
        .post(`/api/interviews/${started.id}/advance`)
        .set("cookie", cookie)
        .send({ action: "answer", text: "I tested the checkout flow end to end." });

      // The engine really did send a coverage log and a probe index, and neither may cross.
      const sent = worker.engine.requests.length;
      expect(sent).toBeGreaterThan(0);
      for (const forbidden of ["criteria_covered", "follow_up_index", "rubric", "ideal_point"]) {
        expect(answered.text).not.toContain(forbidden);
      }
    });
  });

  describe("what is written down", () => {
    it("persists the turns, marks the question reached, and shows it to the candidate", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });

      const read = await http().get(`/api/interviews/${started.id}`).set("cookie", cookie);
      const body = read.body as InterviewSessionResponse;
      expect(body.turns.map((turn) => turn.state)).toEqual(["intro", "question"]);
      expect(body.turns.map((turn) => turn.seq)).toEqual([0, 1]);
      // Reached, so it is now in the candidate's own view; the other three still are not.
      expect(body.questions).toHaveLength(1);
      expect(body.questions[0]?.position).toBe(0);
      expect(body.state).toBe("question");
    });

    it("keeps the coverage log and the probe index server-side, on the row", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      await advance(cookie, started.id, { action: "answer", text: "A real answer." });

      const turns = await prisma.sessionTurn.findMany({
        where: { sessionId: started.id },
        orderBy: { seq: "asc" },
      });
      const answer = turns.find((turn) => turn.speaker === "candidate");
      expect(answer?.criteriaCovered).not.toBeNull();
      const followUp = turns.find((turn) => turn.state === "follow_up");
      expect(followUp?.followUpIndex).toBe(0);

      // And `follow_ups_asked` is recounted from the transcript, not incremented.
      const question = await prisma.interviewSessionQuestion.findFirstOrThrow({
        where: { sessionId: started.id, position: 0 },
      });
      expect(question.followUpsAsked).toBe(1);
      expect(question.askedAt).not.toBeNull();
    });

    it("stores the coverage log exactly as the engine wrote it", async () => {
      /*
       * The API's side of the rule that no per-criterion view may key probes by criterion: it has
       * no such view at all. The log arrives whole from the worker and is written whole, so the one
       * place it could be reshaped — and a second probe on a criterion quietly dropped — is a place
       * this test says does not exist. Byte-for-byte, because "the same criteria are in it" would
       * pass while an entry was being rewritten.
       */
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      await advance(cookie, started.id, { action: "answer", text: "An answer to compare." });

      const sent = worker.engine.responses.at(-1);
      const fromEngine = sent?.turns.find((turn) => turn.speaker === "candidate")?.criteria_covered;
      const stored = await prisma.sessionTurn.findFirstOrThrow({
        where: { sessionId: started.id, speaker: "candidate" },
      });
      expect(fromEngine).toBeTruthy();
      expect(stored.criteriaCovered).toEqual(fromEngine);
    });

    it("times a candidate turn by how long they took and an interviewer turn by how long we did", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      await advance(cookie, started.id, { action: "answer", text: "Something considered." });

      const turns = await prisma.sessionTurn.findMany({
        where: { sessionId: started.id },
        orderBy: { seq: "asc" },
      });
      for (const turn of turns) expect(turn.endedMs).toBeGreaterThanOrEqual(turn.startedMs);
      const answer = turns.find((turn) => turn.speaker === "candidate");
      const before = turns.find((turn) => turn.seq === (answer?.seq ?? 0) - 1);
      // Their turn starts where the interviewer's ended: the time they spent reading and typing.
      expect(answer?.startedMs).toBe(before?.endedMs);
    });

    it("records every model call against the session", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });

      const calls = await prisma.aiCallLog.findMany({ where: { sessionId: started.id } });
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.purpose).toBe("interviewer");
      expect(calls[0]?.userId).not.toBeNull();
    });

    it("records which prompts spoke and which models answered", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });

      const row = await prisma.interviewSession.findFirstOrThrow({ where: { id: started.id } });
      expect(row.promptVersions).toMatchObject({ interview_system: 1, interview_question: 1 });
      // From what was actually called, so a session says which model answered it.
      expect(row.modelConfig).toMatchObject({ interviewer: "fake/fake" });
      expect(row.engineSnapshot).not.toBeNull();
    });

    it("writes the same exchange twice without duplicating a word of it", async () => {
      /*
       * The all-or-nothing rule's other half. A response that reached the API and then failed to be
       * acknowledged is replayed, and the engine allocates the seqs — so applying it again must be a
       * no-op rather than a second copy of the transcript or a unique-key collision.
       */
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });

      const repository = app.get(InterviewSessionsRepository);
      const before = await repository.findForUser(started.id, userIds.at(-1) ?? "");
      const replayed = worker.engine.requests.at(-1);
      expect(before).not.toBeNull();
      expect(replayed).toBeDefined();
      if (!before || !replayed) return;

      const response = await worker.advanceInterview(replayed);
      const applied = await repository.applyExchange(before, response, {
        requestedAt: new Date(),
        respondedAt: new Date(),
      });
      expect(applied.session.turns).toHaveLength(2);
      expect(applied.newlyAsked).toEqual([]);
      expect(applied.session.turns.map((turn) => turn.text)).toEqual(
        before.turns.map((turn) => turn.text),
      );
    });
  });

  describe("the bundle, and the Redis miss the API cannot see", () => {
    it("sends the bundle once and then lets the worker remember it", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      await advance(cookie, started.id, { action: "answer", text: "An answer." });

      expect(worker.engine.requests[0]?.bundle).not.toBeNull();
      expect(worker.engine.requests[0]?.engine_snapshot).toBeNull();
      // Four to eight pinned questions, with their code snippets, not resent every turn.
      expect(worker.engine.requests[1]?.bundle).toBeNull();
      expect(worker.engine.requests[1]?.engine_snapshot).not.toBeNull();
    });

    it("sends it again when the worker says it has lost it", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });

      worker.engine.forgetBundles(); // a Redis flush inside the worker, mid-session
      const frames = await advance(cookie, started.id, { action: "answer", text: "Carrying on." });

      const attempts = worker.engine.requests.slice(1);
      expect(attempts.map((call) => call.bundle === null)).toEqual([true, false]);
      expect(frames.some((frame) => frame.type === "turn")).toBe(true);
      expect(frames.at(-1)?.type).toBe("done");
    });

    it("carries the probes to the worker and nothing else from the answer key", async () => {
      /*
       * The wall, from the API's side. The **probes do cross** — the worker phrases the one the
       * engine chose, and it cannot do that without them — which is why the fixture marks them
       * apart from the rest (`plannedFollowUpMarkers`). Everything else must be absent: the
       * rubric, the criteria, the weights, the level descriptors and the ideal points
       * (CLAUDE.md §5).
       *
       * Asserting both halves rather than one is the point. "The whole key is absent" would be
       * wrong, and "the key is not checked" would prove nothing; this says exactly which half may
       * cross, and fails if either half moves.
       */
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      const sent = JSON.stringify(worker.engine.requests[0]?.bundle);

      expect(fixture.plannedFollowUpMarkers.length).toBeGreaterThan(0);
      expect(fixture.answerKeyMarkers.length).toBeGreaterThan(0);
      for (const probe of fixture.plannedFollowUpMarkers) expect(sent).toContain(probe);
      for (const marker of fixture.answerKeyMarkers) expect(sent).not.toContain(marker);
      for (const field of ["rubric", "criteria", "ideal_points", "levels", "weight"]) {
        expect(sent).not.toContain(field);
      }
      // What crosses instead: enough to log coverage per criterion without knowing the criteria.
      expect(sent).toContain("criterion_count");
    });
  });

  describe("when something goes wrong", () => {
    it("reports an unreachable worker in the stream and changes nothing", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      worker.engine.outcome = "unavailable";

      const frames = await advance(cookie, started.id, { action: "start" });
      expect(frames.map((frame) => frame.type)).toEqual(["thinking", "error"]);
      expect(frames.find((frame) => frame.type === "error")?.code).toBe("worker_unavailable");

      const read = await http().get(`/api/interviews/${started.id}`).set("cookie", cookie);
      const body = read.body as InterviewSessionResponse;
      expect(body.turns).toEqual([]);
      expect(body.state).toBe("intro");
      expect(body.status).toBe("in_progress");
    });

    it("reports an engine refusal in the stream and changes nothing", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      worker.engine.outcome = "engine_error";

      const frames = await advance(cookie, started.id, { action: "start" });
      expect(frames.find((frame) => frame.type === "error")?.code).toBe("interview_error");
      const row = await prisma.interviewSession.findFirstOrThrow({ where: { id: started.id } });
      expect(row.engineSnapshot).toBeNull();
    });

    it("lets the same action be sent again after a failure", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      worker.engine.outcome = "unavailable";
      await advance(cookie, started.id, { action: "start" });

      worker.engine.outcome = "ok";
      const frames = await advance(cookie, started.id, { action: "start" });
      expect(frames.filter((frame) => frame.type === "turn")).toHaveLength(2);
      const read = await http().get(`/api/interviews/${started.id}`).set("cookie", cookie);
      expect((read.body as InterviewSessionResponse).turns).toHaveLength(2);
    });

    it("refuses a second exchange while one is in flight", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      const both = await Promise.all([
        refusal(cookie, started.id, { action: "start" }),
        refusal(cookie, started.id, { action: "start" }),
      ]);
      const statuses = both.map((response) => response.status).sort();
      expect(statuses).toEqual([200, 409]);
      const refused = both.find((response) => response.status === 409);
      expect(refused?.body).toMatchObject({ code: "interview_busy" });
    });
  });

  describe("what may be advanced", () => {
    it("is not another candidate's", async () => {
      const mine = await candidate();
      const theirs = await candidate();
      const started = await session(mine);
      const response = await refusal(theirs, started.id, { action: "start" });
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "interview_not_found" });
    });

    it("is not one that has finished", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });
      const ended = await advance(cookie, started.id, { action: "end" });
      expect(ended.find((frame) => frame.type === "state")?.status).toBe("completed");

      const again = await refusal(cookie, started.id, { action: "answer", text: "Hello?" });
      expect(again.status).toBe(409);
      expect(again.body).toMatchObject({ code: "interview_ended" });
    });

    it("is not one nobody came back to in time", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      // Deadline long past, and past the resume grace with it.
      await prisma.interviewSession.update({
        where: { id: started.id },
        data: { endsAt: new Date(Date.now() - 4 * 60 * 60 * 1_000) },
      });
      const response = await refusal(cookie, started.id, { action: "start" });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "interview_expired" });
    });

    it("needs words to answer with", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      const response = await refusal(cookie, started.id, { action: "answer" });
      expect(response.status).toBe(400);
    });
  });

  describe("ending, and what the completion screen polls", () => {
    it("completes the session and says so", async () => {
      const cookie = await candidate();
      const started = await session(cookie);
      await advance(cookie, started.id, { action: "start" });

      const before = await http().get(`/api/interviews/${started.id}/status`).set("cookie", cookie);
      expect(before.body as InterviewStatusResponse).toMatchObject({
        status: "in_progress",
        ended_at: null,
        feedback_ready: false,
      });

      await advance(cookie, started.id, { action: "end" });
      const after = await http().get(`/api/interviews/${started.id}/status`).set("cookie", cookie);
      const body = after.body as InterviewStatusResponse;
      expect(body.status).toBe("completed");
      expect(body.state).toBe("ended");
      expect(body.ended_at).not.toBeNull();
      // M3 scores nothing, and the screen is told so plainly rather than left spinning.
      expect(body.feedback_ready).toBe(false);
    });

    it("is not another candidate's to poll", async () => {
      const mine = await candidate();
      const theirs = await candidate();
      const started = await session(mine);
      const response = await http()
        .get(`/api/interviews/${started.id}/status`)
        .set("cookie", theirs);
      expect(response.status).toBe(404);
    });
  });
});

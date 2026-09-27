import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  type InterviewFrame,
  type InterviewSessionResponse,
  SessionReportResponse,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { EvaluationProcessor } from "../src/evaluations/evaluation.processor";
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
 * Scoring an ended session, end to end through the real queue (M4 phase 3).
 *
 * The evaluator itself is not exercised here — it is Python and it is tested there, against a
 * scripted model and against a stand-in that reads the real prompt. What is proved here is
 * everything the API owns: that a session ending queues a job, that the job scores every answered
 * question **against the pinned content**, that the arithmetic on top is the weights the session was
 * run with, that a second run costs nothing, and that a model which will not answer leaves an honest
 * gap rather than a fabricated number.
 *
 * It runs against the real BullMQ queue rather than by calling the processor, because the thing most
 * likely to be wrong is the wiring: three different places end a session, and a job nobody enqueues is
 * a report that silently never arrives. Every test gets its own candidate — six interviews an hour is
 * the real rate limit and these specs share one database.
 */
describe("evaluating an ended session", () => {
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
    worker.engine.forgetBundles();
    worker.evaluator.outcome = "ok";
    worker.evaluator.requests.length = 0;
    worker.evaluator.scores = {};
    worker.evaluator.defaultScore = 3;
    worker.evaluator.evidenceFlags = [];
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

  async function started(cookie: string): Promise<InterviewSessionResponse> {
    const created = await http()
      .post("/api/interviews")
      .set("cookie", cookie)
      .send({ minutes: 15 });
    if (created.status !== 201) {
      throw new Error(`starting an interview failed: ${created.status} ${created.text}`);
    }
    return created.body as InterviewSessionResponse;
  }

  /**
   * A session run to the end: the fixture publishes one question, so the engine asks it, follows it up
   * once (the question carries one planned probe), and wraps up on the second answer.
   */
  async function completed(cookie: string): Promise<InterviewSessionResponse> {
    const session = await started(cookie);
    await advance(cookie, session.id, { action: "start" });
    await advance(cookie, session.id, {
      action: "answer",
      text: "I opened the trace in production and counted the queries one request made.",
    });
    await advance(cookie, session.id, {
      action: "answer",
      text: "I would load the relation up front with a join, so it is one query.",
    });
    return session;
  }

  /** The stored report, once the job has run. Polled, because the queue is real. */
  async function report(sessionId: string): Promise<SessionReportResponse> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const row = await prisma.sessionReport.findUnique({ where: { sessionId } });
      if (row) return SessionReportResponse.parse(row.summary);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`no report for session ${sessionId} after 10 s`);
  }

  const evaluationsOf = (sessionId: string) =>
    prisma.answerEvaluation.findMany({
      where: { sessionQuestion: { sessionId } },
      orderBy: { sessionQuestion: { position: "asc" } },
    });

  // -----------------------------------------------------------------------------------------

  it("queues on the way out of the interview, scores the answer, and stores the report", async () => {
    const cookie = await candidate();
    const session = await completed(cookie);
    const summary = await report(session.id);

    expect(summary.status).toBe("ready");
    expect(summary.session_id).toBe(session.id);
    expect(summary.scored_answers).toBe(1);
    expect(summary.total_answers).toBe(1);
    // One evaluator call per answered question, and the fourth width is what it was given.
    expect(worker.evaluator.requests).toHaveLength(1);
    const asked = worker.evaluator.requests[0];
    expect(asked?.question.prompt).toBe(fixture.visibleMarkers.prompt);
    expect(asked?.question.rubric.criteria).toHaveLength(2);
    // The exchange it scores is the question, the answer, the follow-up and the answer to that.
    expect(asked?.exchange.map((turn) => turn.speaker)).toEqual([
      "interviewer",
      "candidate",
      "interviewer",
      "candidate",
    ]);
    // The rubric crossed; the weights did not (`session-bundle.ts` is the only door).
    expect(JSON.stringify(asked?.question.rubric)).not.toContain("weight");
  });

  it("weights by the pinned rubric and discounts the criterion the engine had to ask about", async () => {
    const cookie = await candidate();
    const session = await completed(cookie);
    await report(session.id);

    const [stored] = await evaluationsOf(session.id);
    /*
     * The fixture's rubric is 60/40 and the fake evaluator scores 3 of 4 on both, so the raw score is
     * 75. The question's one planned probe is for criterion 1, the engine asked it, and a prompted
     * criterion contributes at 0.85 of its weight: 0.75 × 60 + 0.75 × 40 × 0.85 = 70.5 → 71.
     */
    expect(stored?.status).toBe("ok");
    expect(stored?.overallRaw).toBe(75);
    expect(stored?.overall).toBe(71);
    // Keyed on the engine fact — the probe it really asked — and not on the coverage model's verdict.
    expect(stored?.promptedCriteria).toEqual([1]);
    expect(stored?.evaluatorProvider).toBe("fake");
    expect(stored?.promptVersions).toMatchObject({ evaluate_answer: 1 });

    const summary = await report(session.id);
    expect(summary.overall).toBe(71);
    // And the candidate is told how much they volunteered, in counts the web turns into a sentence.
    expect(summary.questions[0]?.prompting).toEqual({
      criteria_total: 2,
      criteria_volunteered: 1,
      follow_ups_asked: 1,
    });
  });

  it("shows the pinned ideal points and no other part of the answer key", async () => {
    const cookie = await candidate();
    const session = await completed(cookie);
    const summary = await report(session.id);

    // "What a strong answer covers" (spec §4.4) is the one part of the answer key allowed out, and
    // only because the session has been scored.
    expect(summary.questions[0]?.strong_answer_covers).toHaveLength(2);
    const json = JSON.stringify(summary);
    const allowed = new Set(summary.questions[0]?.strong_answer_covers ?? []);
    const leaked = fixture.answerKeyMarkers.filter(
      (marker) => !allowed.has(marker) && json.includes(marker),
    );
    // Dimensions are permitted by the owner's decision 5, so they are excluded by name rather than
    // by hoping the fixture does not contain them.
    const dimensions = new Set(summary.questions[0]?.criteria.map((row) => row.dimension) ?? []);
    expect(leaked.filter((marker) => !dimensions.has(marker))).toEqual([]);
    // The probes never appear at all here: a report is not a turn an interviewer has spoken.
    for (const probe of fixture.plannedFollowUpMarkers) expect(json).not.toContain(probe);
  });

  it("does not score the same answer twice, and a re-run costs nothing", async () => {
    const cookie = await candidate();
    const session = await completed(cookie);
    await report(session.id);
    expect(worker.evaluator.requests).toHaveLength(1);

    // The same job again — a retry, a second sweep, a candidate starting another interview.
    await app.get(EvaluationProcessor).process({ sessionId: session.id }, { finalAttempt: true });

    expect(worker.evaluator.requests).toHaveLength(1);
    expect(await evaluationsOf(session.id)).toHaveLength(1);
  });

  it("leaves an honest gap when the model will not produce a usable score", async () => {
    worker.evaluator.outcome = "failed";
    const cookie = await candidate();
    const session = await completed(cookie);
    const summary = await report(session.id);

    expect(summary.status).toBe("failed");
    expect(summary.overall).toBeNull();
    expect(summary.scored_answers).toBe(0);
    expect(summary.total_answers).toBe(1);
    expect(summary.questions[0]?.overall).toBeNull();
    expect(summary.questions[0]?.criteria).toEqual([]);

    const [stored] = await evaluationsOf(session.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.failureReason).toBe("invalid_output");
    // The attempts are on the record: three rejected readings, not one silent failure.
    expect(stored?.attempts).toBe(3);
    expect(stored?.overall).toBeNull();
    // And the engine fact is stored anyway — what the interviewer asked happened whatever the
    // evaluator made of the answer.
    expect(stored?.promptedCriteria).toEqual([1]);
  });

  it("stores an instruction-shaped evidence flag and shows it to nobody", async () => {
    /*
     * The line phase 2's injection gate cannot hold: a model that quotes the injection itself quotes
     * something the candidate really typed, so it verifies and the score stands. The owner's decision
     * is to make it visible rather than score around it. The API's part is to store the flag, keep it
     * out of the candidate's report, and change no number because of it (M4 phase 6 draws the list).
     */
    worker.evaluator.evidenceFlags = ["ignore the rubric", "full marks"];
    const cookie = await candidate();
    const session = await completed(cookie);
    const summary = await report(session.id);

    const [stored] = await evaluationsOf(session.id);
    expect(stored?.evidenceFlags).toEqual(["ignore the rubric", "full marks"]);
    // Not a penalty: the same answer, the same score as the unflagged case above.
    expect(stored?.overall).toBe(71);
    const json = JSON.stringify(summary);
    expect(json).not.toContain("ignore the rubric");
    expect(json).not.toContain("evidence_flags");
  });

  it("gives a session nobody answered no job and no report", async () => {
    const cookie = await candidate();
    const session = await started(cookie);
    // Ended from the intro: there is nothing to score, and a report reading "0 of 0" would be worse
    // than the completion screen's own empty state.
    await advance(cookie, session.id, { action: "end" });

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(worker.evaluator.requests).toHaveLength(0);
    expect(await prisma.sessionReport.findUnique({ where: { sessionId: session.id } })).toBeNull();
  });

  it("recommends the track's lessons for the topic that went worst, and tells the next interview", async () => {
    // Nothing scored above 60, so the fixture's topic is weak — and the fixture's track is published
    // for this role and level with that topic marked core, which is exactly what the query is for.
    worker.evaluator.defaultScore = 0;
    const cookie = await candidate();
    const session = await completed(cookie);
    const summary = await report(session.id);

    expect(summary.overall).toBe(0);
    expect(summary.lessons.map((lesson) => lesson.slug)).toEqual([fixture.lessonSlug]);

    // `weak_topics` was `[]` for the whole of M3 because there was nothing to derive it from. The next
    // interview this candidate starts carries it — as a label, because a topic has no enum (ADR-0015).
    worker.engine.requests.length = 0;
    const next = await started(cookie);
    await advance(cookie, next.id, { action: "start" });
    const bundle = worker.engine.requests[0]?.bundle;
    expect(bundle?.candidate.weak_topics).toEqual([fixture.topicName]);
  });
});

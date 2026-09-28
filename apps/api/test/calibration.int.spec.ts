import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  CalibrationAgreementResponse,
  CalibrationAnswer,
  CalibrationFlagsResponse,
  CalibrationQueueResponse,
  CONSENT_VERSIONS,
  type InterviewSessionResponse,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { FakeAiWorker } from "./fake-ai-worker";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";
import { pollFor } from "./poll";
import { framesOf } from "./sse";

/**
 * The calibration area (M4 phase 6, ADR-0017): a person marking an answer the model has marked.
 *
 * What is proved here is the part that fails silently if it is ever wrong — **who may be shown whose
 * words**. A bug in the dashboard's arithmetic is visible on the screen; a bug in the consent filter
 * shows one candidate's interview to a member of staff they told no, and looks exactly like working
 * software. So consent comes first, in four directions: never granted, granted then withdrawn,
 * granted against an old version of the wording, and granted by somebody who is not staff while the
 * owner's gate is closed.
 *
 * The blind-review rule is asserted over the **raw JSON** of the answer payload rather than over
 * parsed fields, for the same reason `content-no-answer-key.int.spec.ts` does: a field nobody
 * remembers adding is exactly the one that leaks, and the model's score is what this screen exists
 * not to show.
 */
describe("the calibration area", () => {
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
    worker.engine.followUps = true;
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

  // ---- The people.

  interface Account {
    id: string;
    email: string;
    cookie: string;
  }

  async function account(role: "candidate" | "content_expert" | "admin"): Promise<Account> {
    const signed = await signUpWithEmail(app, uniqueEmail());
    const id = await giveProfile(prisma, signed.email, fixture.role, fixture.level);
    userIds.push(id);
    if (role !== "candidate") await prisma.user.update({ where: { id }, data: { role } });
    return { id, email: signed.email, cookie: signed.cookie };
  }

  /** A consent decision as the account screen would write it: append-only, versioned. */
  const decide = (
    userId: string,
    granted: boolean,
    // A plain number, not the literal `CONSENT_VERSIONS` infers: one test grants an *older* version
    // on purpose, which is the case `isCurrentGrant` exists for.
    version: number = CONSENT_VERSIONS.transcript_review,
  ) =>
    prisma.consentRecord.create({
      data: { userId, type: "transcript_review", granted, version },
    });

  // ---- An answer to review.

  /**
   * One scored answer, written by `author`. The whole path: a real interview against the fixture's
   * published question, ended, scored through the real queue — so what a reviewer is offered is a row
   * the product made rather than one a test invented.
   */
  async function scoredAnswer(author: Account): Promise<{ sessionId: string; answerId: string }> {
    const created = await http()
      .post("/api/interviews")
      .set("cookie", author.cookie)
      .send({ minutes: 15 });
    expect(created.status).toBe(201);
    const session = created.body as InterviewSessionResponse;
    const advance = async (body: Record<string, unknown>) => {
      const response = await http()
        .post(`/api/interviews/${session.id}/advance`)
        .set("cookie", author.cookie)
        .send(body);
      expect(response.status).toBe(200);
      return framesOf(response.text);
    };
    await advance({ action: "start" });
    await advance({
      action: "answer",
      text: "I opened the trace in production and counted the queries one request made.",
    });
    await advance({
      action: "answer",
      text: "I would load the relation up front with a join, so it is one query.",
    });
    const answerId = await pollFor(`no evaluation for session ${session.id}`, async () => {
      const row = await prisma.answerEvaluation.findFirst({
        where: { sessionQuestion: { sessionId: session.id }, status: "ok" },
      });
      return row?.id ?? null;
    });
    return { sessionId: session.id, answerId };
  }

  /** A consenting staff author with one scored answer — the state the owner's gate allows. */
  async function reviewableAnswer(): Promise<{ author: Account; answerId: string }> {
    const author = await account("content_expert");
    await decide(author.id, true);
    const { answerId } = await scoredAnswer(author);
    return { author, answerId };
  }

  const queue = async (cookie: string, query = "") =>
    CalibrationQueueResponse.parse(
      (await http().get(`/api/admin/calibration/queue${query}`).set("cookie", cookie).expect(200))
        .body,
    );

  const readsOf = (answerId: string) =>
    prisma.auditLog.findMany({
      where: { action: "calibration.answer.read", targetId: answerId },
      orderBy: { createdAt: "asc" },
    });

  // ---- Consent: the rule that fails silently.

  it("offers nothing when nobody has granted transcript review", async () => {
    const reviewer = await account("content_expert");
    const author = await account("content_expert");
    await scoredAnswer(author);

    const body = await queue(reviewer.cookie);
    expect(body.items).toEqual([]);
    // Not merely empty: the screen has to be able to say *why*, or somebody goes looking in the code.
    expect(body.empty_because).toBe("no_consent");
  });

  it("offers an answer once its author has granted, and stops the moment they withdraw", async () => {
    const reviewer = await account("content_expert");
    const { author, answerId } = await reviewableAnswer();

    expect((await queue(reviewer.cookie)).items.map((item) => item.id)).toContain(answerId);

    await decide(author.id, false);
    expect((await queue(reviewer.cookie)).items.map((item) => item.id)).not.toContain(answerId);
    // And the link a reviewer may already be holding stops working, which is the half that matters:
    // consent is checked on the read, not only on the list.
    await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(404);
  });

  it("does not count a yes to wording the person never saw", async () => {
    const reviewer = await account("content_expert");
    const author = await account("content_expert");
    await decide(author.id, true, CONSENT_VERSIONS.transcript_review - 1);
    const { answerId } = await scoredAnswer(author);

    // `isCurrentGrant` requires the current version exactly. A rewritten consent text makes an old
    // yes a yes to a different question (CLAUDE.md "Data & privacy").
    const body = await queue(reviewer.cookie);
    expect(body.items.map((item) => item.id)).not.toContain(answerId);
    expect(body.empty_because).toBe("no_consent");
  });

  it("will not offer a real candidate's answer while the owner's gate is closed", async () => {
    const reviewer = await account("content_expert");
    const candidate = await account("candidate");
    await decide(candidate.id, true);
    const { answerId } = await scoredAnswer(candidate);

    const body = await queue(reviewer.cookie);
    expect(body.items).toEqual([]);
    // Consent was given and is not the reason. The reason is that no reviewer agreement is signed,
    // and `CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS` is how that is held in code rather than in a
    // convention (ADR-0017).
    expect(body.empty_because).toBe("staff_answers_only");
    await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(404);
  });

  it("offers that same answer once the gate is opened", async () => {
    const opened = await createTestApp({
      env: { CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS: "true" },
      overrides: [[AiWorkerClient, worker]],
    });
    try {
      const candidate = await account("candidate");
      await decide(candidate.id, true);
      const { answerId } = await scoredAnswer(candidate);
      const reviewer = await account("content_expert");

      const body = CalibrationQueueResponse.parse(
        (
          await request(opened.getHttpServer())
            .get("/api/admin/calibration/queue")
            .set("cookie", reviewer.cookie)
            .expect(200)
        ).body,
      );
      expect(body.items.map((item) => item.id)).toContain(answerId);
    } finally {
      await opened.close();
    }
  });

  it("does not offer a reviewer their own answer to mark", async () => {
    const reviewer = await account("content_expert");
    await decide(reviewer.id, true);
    const { answerId } = await scoredAnswer(reviewer);

    // They would agree with themselves, and the dashboard would read that as the evaluator being
    // right.
    expect((await queue(reviewer.cookie)).items.map((item) => item.id)).not.toContain(answerId);
    await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(404);
  });

  // ---- Blind review.

  it("shows the pinned rubric and the exchange, and none of the model's marks", async () => {
    const reviewer = await account("content_expert");
    const { author, answerId } = await reviewableAnswer();

    const response = await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(200);
    const answer = CalibrationAnswer.parse(response.body);

    expect(answer.question_prompt).toBe(fixture.visibleMarkers.prompt);
    expect(answer.criteria).toHaveLength(2);
    expect(answer.criteria[0]?.levels["0"]).toBeTruthy();
    expect(answer.exchange.map((turn) => turn.speaker)).toEqual([
      "interviewer",
      "candidate",
      "interviewer",
      "candidate",
    ]);
    expect(answer.my_score).toBeNull();

    // Over the raw JSON, because the point is what nobody remembered to leave out.
    const raw = JSON.stringify(response.body);
    const stored = await prisma.answerEvaluation.findUniqueOrThrow({ where: { id: answerId } });
    expect(stored.overall).toBeGreaterThan(0);
    for (const field of [
      "overall",
      "overall_raw",
      "improvement_tip",
      "covered_points",
      "missing_points",
      "confidence",
      "scoring_version",
    ]) {
      expect(raw).not.toContain(field);
    }
    // Nor the candidate: not their name, not their email, not their id.
    expect(raw).not.toContain(author.email);
    expect(raw).not.toContain(author.id);
  });

  it("records a read as an audited event, once per read", async () => {
    const reviewer = await account("content_expert");
    const { answerId } = await reviewableAnswer();

    expect(await readsOf(answerId)).toHaveLength(0);
    await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(200);
    await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(200);

    const rows = await readsOf(answerId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorType: "admin",
      actorId: reviewer.id,
      targetType: "answer_evaluation",
      targetId: answerId,
    });
    // Ids and counts only: audit rows outlive account deletion (ADR-0011).
    expect(JSON.stringify(rows[0]?.after)).not.toContain("trace in production");
  });

  it("does not record a read it refused", async () => {
    const reviewer = await account("content_expert");
    const author = await account("content_expert");
    const { answerId } = await scoredAnswer(author); // no consent

    await http()
      .get(`/api/admin/calibration/answers/${answerId}`)
      .set("cookie", reviewer.cookie)
      .expect(404);
    expect(await readsOf(answerId)).toHaveLength(0);
  });

  it("refuses a candidate outright", async () => {
    const candidate = await account("candidate");
    await http().get("/api/admin/calibration/queue").set("cookie", candidate.cookie).expect(403);
  });

  // ---- Scoring.

  const scoreBody = (scores: number[], note: string | null = null) => ({
    criteria: scores.map((score, criterion) => ({
      criterion,
      score,
      evidence: [],
      reasoning: null,
    })),
    note,
  });

  it("stores a reviewer's marks, corrects them on a second submission, and hides what they scored", async () => {
    const reviewer = await account("content_expert");
    const { answerId } = await reviewableAnswer();

    await http()
      .post(`/api/admin/calibration/answers/${answerId}/score`)
      .set("cookie", reviewer.cookie)
      .send(scoreBody([2, 1], "Rung 3 and rung 4 cannot be told apart here."))
      .expect(201);

    // `scope=unreviewed` is the default, so it drops out of their own queue...
    expect((await queue(reviewer.cookie)).items.map((item) => item.id)).not.toContain(answerId);
    // ...and `scope=mine` is how they get back to it.
    const mine = await queue(reviewer.cookie, "?scope=mine");
    expect(mine.items.map((item) => item.id)).toContain(answerId);
    expect(mine.items.find((item) => item.id === answerId)?.reviewed_by_me).toBe(true);

    const answer = CalibrationAnswer.parse(
      (
        await http()
          .get(`/api/admin/calibration/answers/${answerId}`)
          .set("cookie", reviewer.cookie)
          .expect(200)
      ).body,
    );
    expect(answer.my_score?.criteria.map((entry) => entry.score)).toEqual([2, 1]);
    expect(answer.my_score?.note).toContain("cannot be told apart");

    // One score per reviewer per answer: sending again is a correction, not a second opinion.
    await http()
      .post(`/api/admin/calibration/answers/${answerId}/score`)
      .set("cookie", reviewer.cookie)
      .send(scoreBody([3, 3]))
      .expect(201);
    const stored = await prisma.calibrationScore.findMany({
      where: { answerEvaluationId: answerId },
    });
    expect(stored).toHaveLength(1);
  });

  it("refuses a score over a different set of criteria than the rubric was pinned with", async () => {
    const reviewer = await account("content_expert");
    const { answerId } = await reviewableAnswer();

    // A short list never reaches the service: the contract's own `min` refuses it as a validation
    // 400, which names the field path rather than a code (ADR-0012). Worth pinning, because it is the
    // reason the service's check cannot be tested with one entry.
    const short = await http()
      .post(`/api/admin/calibration/answers/${answerId}/score`)
      .set("cookie", reviewer.cookie)
      .send(scoreBody([3]))
      .expect(400);
    const shortBody = short.body as { code?: string; errors?: { path?: unknown[] }[] };
    expect(shortBody.code).toBeUndefined();
    expect(shortBody.errors?.[0]?.path?.[0]).toBe("criteria");

    // The right number of entries, the wrong positions: both a criterion left out and one invented,
    // which is the shape only the service can see.
    const invented = await http()
      .post(`/api/admin/calibration/answers/${answerId}/score`)
      .set("cookie", reviewer.cookie)
      .send({
        criteria: [
          { criterion: 0, score: 3, evidence: [], reasoning: null },
          { criterion: 9, score: 3, evidence: [], reasoning: null },
        ],
        note: null,
      })
      .expect(400);
    expect((invented.body as { code?: string }).code).toBe("calibration_criteria_mismatch");
  });

  it("audits a score as well as the read", async () => {
    const reviewer = await account("content_expert");
    const { answerId } = await reviewableAnswer();
    await http()
      .post(`/api/admin/calibration/answers/${answerId}/score`)
      .set("cookie", reviewer.cookie)
      .send(scoreBody([2, 2], "A note about the rubric."))
      .expect(201);

    const rows = await prisma.auditLog.findMany({
      where: { action: "calibration.answer.scored", targetId: answerId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after).toMatchObject({ criteria: 2, has_note: true });
    expect(JSON.stringify(rows[0]?.after)).not.toContain("A note about the rubric");
  });

  // ---- The dashboard, and who may read it.

  it("is an admin's screen, not a reviewer's", async () => {
    const reviewer = await account("content_expert");
    const admin = await account("admin");
    // An aggregate a reviewer reads before scoring is still the model's opinion reaching them first.
    await http().get("/api/admin/calibration/agreement").set("cookie", reviewer.cookie).expect(403);
    await http().get("/api/admin/calibration/agreement").set("cookie", admin.cookie).expect(200);
  });

  it("reports agreement per rubric and per question, over the answers both have scored", async () => {
    const reviewer = await account("content_expert");
    const admin = await account("admin");
    worker.evaluator.defaultScore = 3;
    const { answerId } = await reviewableAnswer();

    const dashboard = async () =>
      CalibrationAgreementResponse.parse(
        (
          await http()
            .get("/api/admin/calibration/agreement")
            .set("cookie", admin.cookie)
            .expect(200)
        ).body,
      );
    const pinned = await prisma.rubric.findUniqueOrThrow({
      where: { id: fixture.rubricId },
      select: { slug: true },
    });
    const rowFor = (body: CalibrationAgreementResponse) =>
      body.by_rubric.find((row) => row.key === pinned.slug);

    /*
     * Asserted as a **delta**, not as an absolute. Every spec in this file scores the same fixture
     * rubric and they share one database, so the row's totals are whatever the neighbours left — an
     * absolute assertion here passed alone and failed in the suite. The precise arithmetic is pinned
     * where it is deterministic, in `calibration-agreement.spec.ts`; what belongs here is that a
     * submitted score reaches the dashboard at all, and reaches the right row.
     */
    const before = await dashboard();
    const was = rowFor(before);
    await http()
      .post(`/api/admin/calibration/answers/${answerId}/score`)
      .set("cookie", reviewer.cookie)
      .send(scoreBody([3, 2]))
      .expect(201);
    const after = await dashboard();
    const now = rowFor(after);

    console.log("DEBUG after", JSON.stringify({ overall: after.overall, row: now }));
    console.log(
      "DEBUG model",
      JSON.stringify(
        (await prisma.answerEvaluation.findUniqueOrThrow({ where: { id: answerId } })).criteria,
      ),
    );
    if (!now) throw new Error("the fixture's rubric has no row in the dashboard");
    // Two criteria compared, from one more answer, by one more reviewer.
    expect(now.agreement.n - (was?.agreement.n ?? 0)).toBe(2);
    expect(now.answers - (was?.answers ?? 0)).toBe(1);
    expect(after.scored_answers - before.scored_answers).toBe(1);
    // The model said 3 and 3 and the person said 3 and 2, so this answer contributes one exact match
    // and one rung of generosity — visible in the overall totals as a rise in `n` of exactly two.
    expect(after.overall.n - before.overall.n).toBe(2);
    expect(now.agreement.within_one).toBe(1);
    expect(after.by_question.some((row) => row.key === fixture.questionSlug)).toBe(true);
  });

  // ---- The injection flags.

  it("lists the answers whose evidence reads like an instruction, with the phrases", async () => {
    const reviewer = await account("content_expert");
    worker.evaluator.evidenceFlags = ["ignore the rubric"];
    const { answerId } = await reviewableAnswer();

    const body = CalibrationFlagsResponse.parse(
      (await http().get("/api/admin/calibration/flags").set("cookie", reviewer.cookie).expect(200))
        .body,
    );
    const item = body.items.find((row) => row.id === answerId);
    expect(item?.flags).toEqual(["ignore the rubric"]);
    expect(body.phrases.find((row) => row.phrase === "ignore the rubric")?.answers).toBeGreaterThan(
      0,
    );

    // And the queue can be narrowed to them, which is how a reviewer works through the list.
    const flagged = await queue(reviewer.cookie, "?flagged=true");
    expect(flagged.items.map((row) => row.id)).toContain(answerId);
    expect(flagged.items.find((row) => row.id === answerId)?.flagged).toBe(true);
  });
});

import type { NestExpressApplication } from "@nestjs/platform-express";
import { type InterviewSessionResponse, SessionReportResponse } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { EvaluationProcessor } from "../src/evaluations/evaluation.processor";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import { FakeAiWorker } from "./fake-ai-worker";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * **The pinning test** (`tasks/todo.md` "Carried forward", ADR-0014 decision 2).
 *
 * Content keeps changing after a session. An admin edits a published question, an expert reworks a
 * rubric's weights, `pnpm db:seed -- --force` re-imports a bank, somebody renames a role. None of
 * that may move a session that has already happened — otherwise a candidate's past report starts
 * describing a rubric nobody scored them against, and `/evals` stops being reproducible.
 *
 * `content_versions` cannot answer this on its own: it snapshots a row *before* a change
 * (ADR-0014 decision 2), so a version number alone cannot reconstruct what was current at session
 * time — the third edit leaves no record of the second. The session carries its own copy.
 *
 * The test does the thing rather than reading the code (the M2.5 lesson): it starts a session,
 * then edits the question, the rubric **and** the role's name through the admin API, and asserts
 * the session did not move. It was watched failing once by hand, on 2026-09-25, by making
 * `toSessionResponse` read the live question row instead of the snapshot — the prompt assertion
 * below failed and nothing else in the suite noticed.
 *
 * ## Extended to scoring (M4 phase 3)
 *
 * A pinned transcript was only ever half of it. From M4 a session is also **scored**, and a score is
 * the thing a candidate will argue with: the report names the question they were asked, the criteria
 * they were judged on, and a number that came out of the rubric's weights. If any of that were read
 * live, an expert reworking a rubric next week would silently rewrite a report somebody read today —
 * and `/evals` would stop being reproducible, because the agreement metric could no longer say what a
 * score was a score of.
 *
 * So the second test below runs a session to the end, lets the real queue score it, and then edits the
 * question's prompt, its ideal points **and the rubric's weights** before asserting that neither the
 * words nor the number moved. It was watched failing in both halves, by hand, on 2026-09-27:
 *
 * - **The words.** Assembling the report from the live `questions` row instead of the snapshot made the
 *   prompt and "what a strong answer covers" assertions fail.
 * - **The number.** Weighting the criteria from the live `rubric_criteria` instead of the snapshot made
 *   the score assertion fail — 60 became 90 on content the candidate never saw.
 *
 * Nothing else in the suite noticed either mutation, which is the reason this file exists.
 */
describe("a session pins the content it was run against", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;
  let cookie: string;
  let adminCookie: string;
  let userId: string;
  const worker = new FakeAiWorker();

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    // The scoring half advances a real session, so the worker has to answer (the engine and the
    // evaluator are both tested for real in Python; here they are stand-ins for their shapes).
    app = await createTestApp({ overrides: [[AiWorkerClient, worker]] });
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);

    const candidate = await signUpWithEmail(app, uniqueEmail());
    cookie = candidate.cookie;
    userId = await giveProfile(prisma, candidate.email, fixture.role, fixture.level);

    const admin = await signUpWithEmail(app, uniqueEmail());
    adminCookie = admin.cookie;
    await setUserRole(prisma, { email: admin.email, role: "admin", actor: { type: "system" } });
  });

  afterAll(async () => {
    await prisma.interviewSession.deleteMany({ where: { userId } });
    await removeContent(prisma, fixture);
    await app.close();
  });

  it("does not move when the question, its rubric and the role all change afterwards", async () => {
    // 1. A session against the content as it stands.
    const created = await http()
      .post("/api/interviews")
      .set("cookie", cookie)
      .send({ minutes: 15 });
    expect(created.status).toBe(201);
    const session = created.body as InterviewSessionResponse;

    const pinnedBefore = await prisma.interviewSessionQuestion.findFirstOrThrow({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });
    const snapshotBefore = pinnedBefore.snapshot as {
      prompt: string;
      rubric: { criteria: { weight: number }[] };
      ideal_points: string[];
    };
    expect(snapshotBefore.prompt).toBe(fixture.visibleMarkers.prompt);

    // The candidate has reached it, so it is in their view of the session.
    await prisma.interviewSessionQuestion.update({
      where: { id: pinnedBefore.id },
      data: { askedAt: new Date() },
    });
    const beforeEdit = await http().get(`/api/interviews/${session.id}`).set("cookie", cookie);
    expect((beforeEdit.body as InterviewSessionResponse).questions[0]?.prompt).toBe(
      fixture.visibleMarkers.prompt,
    );

    // 2. Everything it was run against changes, through the API an admin really uses.
    const admin = await http()
      .get(`/api/admin/content/questions/${fixture.questionId}`)
      .set("cookie", adminCookie);
    expect(admin.status).toBe(200);
    const question = admin.body as Record<string, unknown>;
    const editedQuestion = await http()
      .put(`/api/admin/content/questions/${fixture.questionId}`)
      .set("cookie", adminCookie)
      .send({
        ...question,
        prompt: "EDITED prompt: this is not what the candidate was asked",
        ideal_points: ["EDITED ideal point"],
      });
    expect(editedQuestion.status).toBe(200);

    const rubric = await http()
      .get(`/api/admin/content/rubrics/${fixture.rubricId}`)
      .set("cookie", adminCookie);
    const rubricBody = rubric.body as { criteria: { weight: number }[] };
    const reweighted = rubricBody.criteria.map((criterion, index) => ({
      ...criterion,
      weight: index === 0 ? 90 : 10,
    }));
    const editedRubric = await http()
      .put(`/api/admin/content/rubrics/${fixture.rubricId}`)
      .set("cookie", adminCookie)
      .send({ ...rubricBody, criteria: reweighted });
    expect(editedRubric.status).toBe(200);

    const role = await http()
      .get(`/api/admin/content/career-roles/${fixture.catalogue.roleId}`)
      .set("cookie", adminCookie);
    const roleBody = role.body as Record<string, unknown>;
    const renamed = await http()
      .put(`/api/admin/content/career-roles/${fixture.catalogue.roleId}`)
      .set("cookie", adminCookie)
      .send({ ...roleBody, name: "RENAMED role" });
    expect(renamed.status).toBe(200);

    // The edits really landed: a test that changed nothing would pass everything below.
    const live = await prisma.question.findUniqueOrThrow({ where: { id: fixture.questionId } });
    expect(live.prompt).toBe("EDITED prompt: this is not what the candidate was asked");
    expect(live.version).toBeGreaterThan(pinnedBefore.questionVersion);
    const liveRole = await prisma.careerRole.findUniqueOrThrow({
      where: { id: fixture.catalogue.roleId },
    });
    expect(liveRole.name).toBe("RENAMED role");

    // 3. The session says what it always said.
    const pinnedAfter = await prisma.interviewSessionQuestion.findUniqueOrThrow({
      where: { id: pinnedBefore.id },
    });
    expect(pinnedAfter.snapshot).toEqual(pinnedBefore.snapshot);
    expect(pinnedAfter.questionVersion).toBe(pinnedBefore.questionVersion);
    expect(pinnedAfter.rubricVersion).toBe(pinnedBefore.rubricVersion);

    const afterEdit = await http().get(`/api/interviews/${session.id}`).set("cookie", cookie);
    const reread = afterEdit.body as InterviewSessionResponse;
    expect(reread.questions[0]?.prompt).toBe(fixture.visibleMarkers.prompt);
    expect(JSON.stringify(reread)).not.toContain("EDITED prompt");
    // And the role it was run for is the role it was run for, whatever the catalogue says now.
    expect(reread.role.name).toBe(fixture.catalogue.roleName);
    expect(reread.role.name).not.toBe("RENAMED role");

    // The list says the same thing as the session.
    const list = await http().get("/api/interviews").set("cookie", cookie);
    const [summary] = (list.body as { items: { role: { name: string } }[] }).items;
    expect(summary?.role.name).toBe(fixture.catalogue.roleName);
  });

  it("does not move a scored report when the question and the rubric's weights change", async () => {
    /*
     * **The edit happens while the interview is running**, not after it is scored, and that ordering is
     * the whole test. A session lasts fifteen to thirty minutes and an expert can rework a rubric in
     * that window, so "pinned" has to mean pinned at the moment of **scoring** and not merely at the
     * moment of asking. Written the other way round — score first, edit afterwards — this passed with
     * the weights read live, because a scored answer is never re-scored and the stale read never
     * happened. That was found by mutating the code and watching the test not fail.
     *
     * Four out of four on the first criterion and nothing on the second, so the score depends on the
     * **weights**: with both criteria scoring alike, any weighting gives the same number and this would
     * pass on live content too.
     */
    worker.evaluator.scores = { 0: 4, 1: 0 };
    const created = await http()
      .post("/api/interviews")
      .set("cookie", cookie)
      .send({ minutes: 15 });
    expect(created.status).toBe(201);
    const session = created.body as InterviewSessionResponse;
    await advance(session.id, { action: "start" });

    // What the session was actually run against — read from the pin, not from the fixture, so this
    // test is independent of whatever the test above left behind.
    const pinned = await prisma.interviewSessionQuestion.findFirstOrThrow({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });
    const snapshot = pinned.snapshot as {
      prompt: string;
      ideal_points: string[];
      rubric: { criteria: { position: number; weight: number; dimension: string }[] };
    };
    const [first, second] = snapshot.rubric.criteria;
    if (!first || !second) throw new Error("the fixture's rubric should have two criteria");
    // 4/4 on the first criterion, 0 on the second: the score IS the first criterion's share.
    const expected = Math.round((first.weight / (first.weight + second.weight)) * 100);

    // Mid-interview: everything this session will be scored against changes, through the API an admin
    // really uses — and the weights are inverted, which is the edit that would move the number.
    const admin = await http()
      .get(`/api/admin/content/questions/${fixture.questionId}`)
      .set("cookie", adminCookie);
    const question = admin.body as Record<string, unknown>;
    const editedQuestion = await http()
      .put(`/api/admin/content/questions/${fixture.questionId}`)
      .set("cookie", adminCookie)
      .send({
        ...question,
        prompt: "RESCORED prompt: this is not the question that was scored",
        ideal_points: ["RESCORED ideal point"],
      });
    expect(editedQuestion.status, editedQuestion.text).toBe(200);

    const rubric = await http()
      .get(`/api/admin/content/rubrics/${fixture.rubricId}`)
      .set("cookie", adminCookie);
    const rubricBody = rubric.body as { criteria: { weight: number; dimension: string }[] };
    // By index, not by a `position` field: the admin shape carries the criteria in order and does not
    // repeat their positions, so reading `criterion.position` here silently gave `undefined` and the
    // weights came out summing to 180 — which the API rightly refused.
    const inverted = rubricBody.criteria.map((criterion, index) => ({
      ...criterion,
      weight: index === 0 ? second.weight : first.weight,
      dimension: `RESCORED dimension ${index}`,
    }));
    const editedRubric = await http()
      .put(`/api/admin/content/rubrics/${fixture.rubricId}`)
      .set("cookie", adminCookie)
      .send({ ...rubricBody, criteria: inverted });
    expect(editedRubric.status, editedRubric.text).toBe(200);

    // The edits really landed: a test that changed nothing would pass everything below.
    const live = await prisma.rubricCriterion.findMany({
      where: { rubricId: fixture.rubricId },
      orderBy: { position: "asc" },
    });
    expect(live.map((row) => row.weight)).toEqual([second.weight, first.weight]);
    expect(live[0]?.dimension).toBe("RESCORED dimension 0");

    // Now the candidate finishes, and the queue scores an answer whose live content no longer matches
    // what they were asked.
    await advance(session.id, {
      action: "answer",
      text: "I counted the queries the request really made in production.",
    });
    await advance(session.id, {
      action: "answer",
      text: "I would load the relation up front, so it is one query.",
    });

    const scored = await report(session.id);
    expect(scored.status).toBe("ready");
    // The number came out of the weights the session pinned, not the ones in the table now.
    expect(scored.overall).toBe(expected);
    expect(scored.questions[0]?.prompt).toBe(snapshot.prompt);
    expect(scored.questions[0]?.strong_answer_covers).toEqual(snapshot.ideal_points);
    expect(scored.questions[0]?.criteria.map((row) => row.dimension)).toEqual([
      first.dimension,
      second.dimension,
    ]);
    const json = JSON.stringify(scored);
    expect(json).not.toContain("RESCORED prompt");
    expect(json).not.toContain("RESCORED ideal point");
    expect(json).not.toContain("RESCORED dimension");

    // And the stored row, which is what `/evals` and the calibration tool read.
    const stored = await prisma.answerEvaluation.findUniqueOrThrow({
      where: { sessionQuestionId: pinned.id },
    });
    expect(stored.overall).toBe(expected);
    expect(stored.overallRaw).toBe(expected);

    // Re-running the job does not move it either: an answer with a row is never re-scored, which is
    // what makes a stale read impossible rather than merely unlikely.
    await app.get(EvaluationProcessor).process({ sessionId: session.id }, { finalAttempt: true });
    const again = await report(session.id);
    expect(again.overall).toBe(expected);
    expect(again.questions[0]?.prompt).toBe(snapshot.prompt);
  });

  // ---------------------------------------------------------------------------------------------

  async function advance(id: string, body: Record<string, unknown>): Promise<void> {
    const response = await http()
      .post(`/api/interviews/${id}/advance`)
      .set("cookie", cookie)
      .send(body);
    expect(response.status, response.text).toBe(200);
  }

  /** The stored report, once the queue has run. */
  async function report(sessionId: string): Promise<SessionReportResponse> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const row = await prisma.sessionReport.findUnique({ where: { sessionId } });
      if (row) return SessionReportResponse.parse(row.summary);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`no report for session ${sessionId} after 10 s`);
  }
});

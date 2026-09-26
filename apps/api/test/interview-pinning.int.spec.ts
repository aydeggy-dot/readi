import type { NestExpressApplication } from "@nestjs/platform-express";
import type { InterviewSessionResponse } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 */
describe("a session pins the content it was run against", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;
  let cookie: string;
  let adminCookie: string;
  let userId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
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
});

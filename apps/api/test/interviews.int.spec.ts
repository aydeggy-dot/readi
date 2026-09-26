import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { InterviewSessionResponse, InterviewSummary } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InterviewSessionsRepository } from "../src/interviews/interview-sessions.repository";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  giveProfile,
  removeContent,
  seedPublishedContent,
  type ContentFixture,
} from "./content-fixtures";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * Starting, listing and reading an interview (M3 phase 1). There is no engine yet — phase 2 builds
 * it in the worker — so what is proved here is everything that happens before a word is spoken:
 * who may be interviewed, against which published content, with which questions, and what a
 * candidate can see of a session while it runs.
 *
 * **Every test that starts sessions gets its own candidate.** Six an hour is the real limit and
 * these tests share one database, so a spec that reuses one candidate starts failing with `429`
 * somewhere in the middle — which is what the first draft of this file did, and it surfaced three
 * files later as `/api/interviews/undefined`.
 */
describe("interviews", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let fixture: ContentFixture;

  const http = () => request(app.getHttpServer());
  const userIds: string[] = [];
  const extraQuestionIds: string[] = [];
  const extraRubricIds: string[] = [];

  /** A signed-in candidate with a profile pointing at the fixture's role and level. */
  async function candidate(): Promise<{ cookie: string; userId: string }> {
    const signed = await signUpWithEmail(app, uniqueEmail());
    const userId = await giveProfile(prisma, signed.email, fixture.role, fixture.level);
    userIds.push(userId);
    return { cookie: signed.cookie, userId };
  }

  const start = (cookie: string, body: Record<string, unknown> = { minutes: 15 }) =>
    http().post("/api/interviews").set("cookie", cookie).send(body);

  /** A session, or a readable failure — so a test never asserts against `undefined.id`. */
  async function startOk(cookie: string, body?: Record<string, unknown>) {
    const response = await start(cookie, body);
    if (response.status !== 201) {
      throw new Error(`starting an interview failed: ${response.status} ${response.text}`);
    }
    return response.body as InterviewSessionResponse;
  }

  /** Another published question on the same role and level, so a session has a choice. */
  async function addQuestion(type: "technical" | "behavioral" | "scenario"): Promise<void> {
    const id = randomUUID().slice(0, 8);
    const rubric = await prisma.rubric.create({
      data: {
        slug: `extra-rubric-${id}`,
        name: `Extra rubric ${id}`,
        status: "published",
        criteria: {
          create: [60, 40].map((weight, position) => ({
            dimension: `Dimension ${position}`,
            description: `Description ${position}`,
            weight,
            position,
            levels: Object.fromEntries(
              ["0", "1", "2", "3", "4"].map((band) => [band, `Level ${band}`]),
            ),
          })),
        },
      },
    });
    const question = await prisma.question.create({
      data: {
        slug: `extra-question-${id}`,
        type,
        topicId: fixture.topicId,
        difficulty: 3,
        prompt: `VISIBLE extra prompt ${id}`,
        rubricId: rubric.id,
        idealPoints: ["something"],
        plannedFollowUps: [{ criterion: 1, probe: `probe ${id}` }],
        status: "published",
        roles: { create: [{ roleId: fixture.catalogue.roleId }] },
        levels: { create: [{ levelId: fixture.catalogue.levelId }] },
      },
    });
    extraQuestionIds.push(question.id);
    extraRubricIds.push(rubric.id);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    fixture = await seedPublishedContent(prisma);
    for (const type of ["technical", "scenario", "behavioral"] as const) await addQuestion(type);
  });

  afterAll(async () => {
    await prisma.interviewSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.question.deleteMany({ where: { id: { in: extraQuestionIds } } });
    await prisma.rubric.deleteMany({ where: { id: { in: extraRubricIds } } });
    await removeContent(prisma, fixture);
    await app.close();
  });

  describe("starting one", () => {
    it("takes the role, level and variant from the profile", async () => {
      const { cookie } = await candidate();
      const session = await startOk(cookie);
      expect(session.role.slug).toBe(fixture.role);
      expect(session.level.slug).toBe(fixture.level);
      // The profile was given no variant, so the session has none: general questions only.
      expect(session.stack).toBeNull();
      expect(session.state).toBe("intro");
      expect(session.status).toBe("in_progress");
      expect(session.question_budget).toBeGreaterThan(0);
      expect(session.max_follow_ups).toBe(2);
      // Nothing has been asked yet, so there is nothing to read.
      expect(session.questions).toEqual([]);
      expect(session.turns).toEqual([]);
    });

    it("pins a version and a snapshot for every question it selected", async () => {
      const { cookie } = await candidate();
      const session = await startOk(cookie);
      const pinned = await prisma.interviewSessionQuestion.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
      });
      expect(pinned.length).toBeGreaterThan(1);
      for (const row of pinned) {
        expect(row.questionVersion).toBeGreaterThanOrEqual(1);
        expect(row.rubricVersion).toBeGreaterThanOrEqual(1);
        const snapshot = row.snapshot as { prompt: string; rubric: { criteria: unknown[] } };
        expect(snapshot.prompt.length).toBeGreaterThan(0);
        expect(snapshot.rubric.criteria.length).toBeGreaterThan(0);
      }
      // No question twice in one session, and the budget matches what was actually pinned.
      expect(new Set(pinned.map((row) => row.questionId)).size).toBe(pinned.length);
      expect(session.question_budget).toBe(pinned.length);
    });

    it("ends a session the candidate had left running", async () => {
      const { cookie } = await candidate();
      const first = await startOk(cookie);
      const second = await startOk(cookie);
      const previous = await prisma.interviewSession.findUniqueOrThrow({ where: { id: first.id } });
      expect(previous.status).toBe("abandoned");
      expect(previous.endedAt).not.toBeNull();
      const current = await prisma.interviewSession.findUniqueOrThrow({ where: { id: second.id } });
      expect(current.status).toBe("in_progress");
    });

    it("refuses a diagnostic that is not the preset", async () => {
      const { cookie } = await candidate();
      const wrongLength = await start(cookie, { minutes: 30, is_diagnostic: true });
      expect(wrongLength.status).toBe(400);
      expect(JSON.stringify(wrongLength.body)).toContain("minutes");

      const withTypes = await start(cookie, {
        minutes: 15,
        is_diagnostic: true,
        types: ["technical"],
      });
      expect(withTypes.status).toBe(400);
      expect(JSON.stringify(withTypes.body)).toContain("types");
    });

    it("refuses a question type the role is not interviewed with", async () => {
      const { cookie } = await candidate();
      // The fixture role supports technical, scenario and behavioral — not test_design.
      const response = await start(cookie, { minutes: 15, types: ["test_design"] });
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body)).toContain("types");
    });

    it("refuses a session there are no published questions for", async () => {
      const { cookie } = await candidate();
      const emptyLevel = await prisma.careerLevel.create({
        data: {
          slug: `empty-level-${randomUUID().slice(0, 8)}`,
          name: "Empty",
          rank: 40,
          status: "published",
        },
      });
      await prisma.careerRoleLevel.create({
        data: { roleId: fixture.catalogue.roleId, levelId: emptyLevel.id, position: 1 },
      });

      const response = await start(cookie, { minutes: 15, level: emptyLevel.slug });
      expect(response.status).toBe(409);
      expect((response.body as { code: string }).code).toBe("no_questions_available");

      await prisma.careerRoleLevel.deleteMany({ where: { levelId: emptyLevel.id } });
      await prisma.careerLevel.delete({ where: { id: emptyLevel.id } });
    });

    /**
     * `senior` is the live case: a level that exists as a draft and that no role offers. A
     * candidate must not be able to ask for it, and the failure if this were not enforced would be
     * silent — a session run against content nobody published.
     */
    it("cannot be asked for against an unpublished level", async () => {
      const { cookie } = await candidate();
      const draft = await prisma.careerLevel.create({
        data: { slug: `draft-level-${randomUUID().slice(0, 8)}`, name: "Draft", rank: 50 },
      });
      const response = await start(cookie, { minutes: 15, level: draft.slug });
      expect(response.status).toBe(404);
      expect((response.body as { code: string }).code).toBe("level_not_found");
      await prisma.careerLevel.delete({ where: { id: draft.id } });
    });

    it("uses the variant on the profile when the role still offers it", async () => {
      const signed = await signUpWithEmail(app, uniqueEmail());
      userIds.push(
        await giveProfile(
          prisma,
          signed.email,
          fixture.role,
          fixture.level,
          fixture.catalogue.stackSlug,
        ),
      );
      const session = await startOk(signed.cookie);
      expect(session.stack?.slug).toBe(fixture.catalogue.stackSlug);
    });

    /**
     * The candidate did nothing wrong: the variant on their profile was retired, or belongs to the
     * role they usually practise rather than the one they just chose. Refusing would lock them out
     * of starting any interview until they edited a field that is optional by design, so it
     * degrades to the general questions instead — which is what "no variant" already means.
     */
    it("drops a retired variant inherited from the profile rather than refusing", async () => {
      const signed = await signUpWithEmail(app, uniqueEmail());
      userIds.push(
        await giveProfile(
          prisma,
          signed.email,
          fixture.role,
          fixture.level,
          fixture.catalogue.stackSlug,
        ),
      );
      await prisma.stack.update({
        where: { id: fixture.catalogue.stackId },
        data: { status: "retired" },
      });
      try {
        const session = await startOk(signed.cookie);
        expect(session.stack).toBeNull();
      } finally {
        await prisma.stack.update({
          where: { id: fixture.catalogue.stackId },
          data: { status: "published" },
        });
      }
    });

    it("refuses a variant the request named that the role does not offer", async () => {
      const { cookie } = await candidate();
      const elsewhere = await prisma.stack.create({
        data: {
          slug: `other-stack-${randomUUID().slice(0, 8)}`,
          name: "Other",
          status: "published",
        },
      });
      const response = await start(cookie, { minutes: 15, stack: elsewhere.slug });
      expect(response.status).toBe(400);
      expect((response.body as { code: string }).code).toBe("stack_not_offered");
      await prisma.stack.delete({ where: { id: elsewhere.id } });
    });

    it("refuses a published level the role does not offer", async () => {
      const { cookie } = await candidate();
      const elsewhere = await prisma.careerLevel.create({
        data: {
          slug: `other-level-${randomUUID().slice(0, 8)}`,
          name: "Other",
          rank: 60,
          status: "published",
        },
      });
      const response = await start(cookie, { minutes: 15, level: elsewhere.slug });
      expect(response.status).toBe(400);
      expect((response.body as { code: string }).code).toBe("level_not_offered");
      await prisma.careerLevel.delete({ where: { id: elsewhere.id } });
    });
  });

  describe("reading one back", () => {
    it("shows only the questions the session has reached", async () => {
      const { cookie } = await candidate();
      const session = await startOk(cookie);
      const pinned = await prisma.interviewSessionQuestion.findMany({
        where: { sessionId: session.id },
        orderBy: { position: "asc" },
      });
      expect(pinned.length).toBeGreaterThan(1);

      const asked = pinned[0];
      if (!asked) throw new Error("no pinned question");
      await prisma.interviewSessionQuestion.update({
        where: { id: asked.id },
        data: { askedAt: new Date() },
      });

      const response = await http().get(`/api/interviews/${session.id}`).set("cookie", cookie);
      expect(response.status).toBe(200);
      const body = response.body as InterviewSessionResponse;
      expect(body.questions).toHaveLength(1);
      expect(body.questions[0]?.position).toBe(0);

      /*
       * The assertion that matters is about the questions that are NOT there: reading ahead is a
       * leak of the interview even though it is not a leak of the answer key.
       */
      for (const row of pinned.slice(1)) {
        expect(JSON.stringify(body)).not.toContain((row.snapshot as { prompt: string }).prompt);
      }
    });

    it("is another candidate's 404", async () => {
      const { cookie } = await candidate();
      const session = await startOk(cookie);
      const other = await signUpWithEmail(app, uniqueEmail());
      const response = await http()
        .get(`/api/interviews/${session.id}`)
        .set("cookie", other.cookie);
      expect(response.status).toBe(404);
      expect((response.body as { code: string }).code).toBe("interview_not_found");
    });

    it("lists this candidate's sessions, newest first, and pages with a cursor", async () => {
      const { cookie } = await candidate();
      const started = [await startOk(cookie), await startOk(cookie), await startOk(cookie)];

      const first = await http().get("/api/interviews").query({ limit: 2 }).set("cookie", cookie);
      expect(first.status).toBe(200);
      const page = first.body as { items: InterviewSummary[]; next_cursor: string | null };
      expect(page.items).toHaveLength(2);
      expect(page.next_cursor).not.toBeNull();

      const second = await http()
        .get("/api/interviews")
        .query({ limit: 2, cursor: page.next_cursor })
        .set("cookie", cookie);
      const rest = second.body as { items: InterviewSummary[] };
      const ids = [...page.items, ...rest.items].map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(new Set(ids)).toEqual(new Set(started.map((session) => session.id)));
      // The one still running is the newest, and the two before it were abandoned by it.
      expect(page.items[0]?.id).toBe(started[2]?.id);
      expect(page.items[0]?.status).toBe("in_progress");
    });

    it("does not list another candidate's sessions", async () => {
      const mine = await candidate();
      await startOk(mine.cookie);
      const theirs = await candidate();
      const response = await http().get("/api/interviews").set("cookie", theirs.cookie);
      expect((response.body as { items: InterviewSummary[] }).items).toEqual([]);
    });
  });

  describe("the stale sweep", () => {
    it("abandons a session whose deadline passed while nobody was there", async () => {
      const { cookie } = await candidate();
      const session = await startOk(cookie);
      // Deadline long past, and past the resume grace on top of it.
      await prisma.interviewSession.update({
        where: { id: session.id },
        data: { endsAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
      });
      await app.get(InterviewSessionsRepository).abandonStale(new Date());

      const swept = await prisma.interviewSession.findUniqueOrThrow({ where: { id: session.id } });
      expect(swept.status).toBe("abandoned");
      expect(swept.state).toBe("ended");
    });

    it("leaves a session that is still inside its deadline alone", async () => {
      const { cookie } = await candidate();
      const session = await startOk(cookie);
      await app.get(InterviewSessionsRepository).abandonStale(new Date());
      const untouched = await prisma.interviewSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(untouched.status).toBe("in_progress");
    });
  });

  describe("rate limits", () => {
    it("stops a candidate starting more than six in an hour", async () => {
      const { cookie } = await candidate();
      for (let index = 0; index < 6; index += 1) {
        expect((await start(cookie)).status).toBe(201);
      }
      const refused = await start(cookie);
      expect(refused.status).toBe(429);
      expect((refused.body as { code: string }).code).toBe("rate_limited");
    });
  });

  describe("without a profile", () => {
    it("asks the candidate to finish onboarding, or to say what they want", async () => {
      const fresh = await signUpWithEmail(app, uniqueEmail());
      const response = await start(fresh.cookie);
      expect(response.status).toBe(400);
      expect((response.body as { code: string }).code).toBe("profile_required");
    });
  });
});

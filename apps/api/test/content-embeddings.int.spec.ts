import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { ContentTransitionResponse, Question, Rubric } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import { FakeAiWorker } from "./fake-ai-worker";
import { createTestApp, signUpWithEmail, uniqueEmail } from "./helpers";

/**
 * Publishing a question embeds it and warns about near-duplicates (ADR-0006). The worker is a
 * fake here — the provider adapters are tested in Python — so what this proves is the API's half:
 * the vector reaches the column, the cosine search finds it, the threshold is respected, and a
 * warning never becomes a refusal.
 */
describe("question embeddings", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let worker: FakeAiWorker;
  let admin: string;
  let topicId: string;
  let rubricId: string;
  const questions: string[] = [];
  const created: string[] = [];

  const http = () => request(app.getHttpServer());
  const short = () => randomUUID().slice(0, 8);

  /** A published question carrying `prompt`, through the API, as a content expert would. */
  const publishQuestion = async (prompt: string): Promise<ContentTransitionResponse> => {
    const created = await http()
      .post("/api/admin/content/questions")
      .set({ cookie: admin })
      .send({
        slug: `embed-${short()}`,
        roles: ["frontend"],
        levels: ["mid"],
        type: "technical",
        topic_id: topicId,
        subtopic: null,
        difficulty: 3,
        prompt,
        context: null,
        rubric_id: rubricId,
        ideal_points: ["Measures first"],
      });
    expect(created.status).toBe(201);
    const question = created.body as Question;
    questions.push(question.id);

    await http()
      .post(`/api/admin/content/questions/${question.id}/transition`)
      .set({ cookie: admin })
      .send({ transition: "submit", note: null });
    const published = await http()
      .post(`/api/admin/content/questions/${question.id}/transition`)
      .set({ cookie: admin })
      .send({ transition: "publish", note: null });
    expect(published.status).toBe(201);
    return published.body as ContentTransitionResponse;
  };

  beforeAll(async () => {
    worker = new FakeAiWorker();
    app = await createTestApp({ overrides: [[AiWorkerClient, worker]] });
    prisma = app.get(PrismaService);

    const user = await signUpWithEmail(app, uniqueEmail());
    admin = user.cookie;
    await setUserRole(prisma, { email: user.email, role: "admin", actor: { type: "system" } });

    const topic = await prisma.topic.create({
      data: { slug: `embed-topic-${short()}`, name: "Performance", description: null },
    });
    topicId = topic.id;
    created.push(topic.id);

    const rubricResponse = await http()
      .post("/api/admin/content/rubrics")
      .set({ cookie: admin })
      .send({
        slug: `embed-rubric-${short()}`,
        name: "Performance reasoning",
        criteria: [
          {
            dimension: "Framing",
            description: "Names the constraint.",
            weight: 50,
            levels: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
          },
          {
            dimension: "Measurement",
            description: "Measures first.",
            weight: 50,
            levels: { "0": "a", "1": "b", "2": "c", "3": "d", "4": "e" },
          },
        ],
      });
    rubricId = (rubricResponse.body as Rubric).id;
    await http()
      .post(`/api/admin/content/rubrics/${rubricId}/transition`)
      .set({ cookie: admin })
      .send({ transition: "submit", note: null });
    await http()
      .post(`/api/admin/content/rubrics/${rubricId}/transition`)
      .set({ cookie: admin })
      .send({ transition: "publish", note: null });
  });

  beforeEach(() => {
    worker.embedOutcome = "ok";
    worker.embedDimensions = 1024;
  });

  afterAll(async () => {
    await prisma.question.deleteMany({ where: { id: { in: questions } } });
    await prisma.rubric.deleteMany({ where: { id: rubricId } });
    await prisma.topic.deleteMany({ where: { id: { in: created } } });
    await app.close();
  });

  it("embeds a question when it is published, and records what the call cost", async () => {
    const before = await prisma.aiCallLog.count({ where: { purpose: "embedding" } });
    const prompt = `Why is this page slow on 3G? ${short()}`;
    const published = await publishQuestion(prompt);

    expect(published.duplicates).toEqual([]);
    const stored = await prisma.question.findUniqueOrThrow({
      where: { id: published.id },
      select: { embeddingModel: true, embeddedAt: true },
    });
    expect(stored.embeddingModel).toBe("fake");
    expect(stored.embeddedAt).not.toBeNull();
    expect(await prisma.aiCallLog.count({ where: { purpose: "embedding" } })).toBe(before + 1);

    // The worker was asked for the prompt itself, and nothing else.
    expect(worker.embedRequests.at(-1)?.texts).toEqual([prompt]);
  });

  it("warns when a question is published that says the same thing as another", async () => {
    const prompt = `Explain the event loop, in your own words. ${short()}`;
    const first = await publishQuestion(prompt);
    const second = await publishQuestion(prompt);

    expect(second.duplicates).toHaveLength(1);
    expect(second.duplicates[0]).toMatchObject({
      question_id: first.id,
      status: "published",
      prompt,
    });
    expect(second.duplicates[0]?.similarity).toBeCloseTo(1, 5);

    // A warning, never a refusal: the question is published either way.
    expect(second.status).toBe("published");
  });

  it("stays quiet about a question that says something else", async () => {
    await publishQuestion(`Describe a time you disagreed with a reviewer. ${short()}`);
    const other = await publishQuestion(`How would you test a flaky payment webhook? ${short()}`);
    expect(other.duplicates).toEqual([]);
  });

  it("reports duplicates of text that has not been saved yet", async () => {
    const prompt = `What does the CAP theorem rule out? ${short()}`;
    const published = await publishQuestion(prompt);

    const response = await http()
      .post("/api/admin/content/questions/duplicate-check")
      .set({ cookie: admin })
      .send({ prompt, context: null, exclude_question_id: null });
    expect(response.status).toBe(200);
    expect((response.body as { matches: { question_id: string }[] }).matches[0]).toMatchObject({
      question_id: published.id,
    });

    // A question being edited does not report itself.
    const excluded = await http()
      .post("/api/admin/content/questions/duplicate-check")
      .set({ cookie: admin })
      .send({ prompt, context: null, exclude_question_id: published.id });
    expect((excluded.body as { matches: unknown[] }).matches).toEqual([]);
  });

  it("publishes anyway when the worker cannot be reached, and leaves no vector behind", async () => {
    worker.embedOutcome = "unavailable";
    const published = await publishQuestion(`An unembeddable question. ${short()}`);

    expect(published.status).toBe("published");
    expect(published.duplicates).toEqual([]);
    const stored = await prisma.question.findUniqueOrThrow({
      where: { id: published.id },
      select: { embeddingModel: true },
    });
    expect(stored.embeddingModel).toBeNull();
  });

  it("refuses a vector of the wrong length rather than store one that cannot be searched", async () => {
    worker.embedDimensions = 16; // what a model change would look like
    const published = await publishQuestion(`A question embedded by another model. ${short()}`);

    const stored = await prisma.question.findUniqueOrThrow({
      where: { id: published.id },
      select: { embeddingModel: true },
    });
    expect(stored.embeddingModel).toBeNull();
  });

  it("re-embeds a published question when its wording changes", async () => {
    const published = await publishQuestion(`First wording. ${short()}`);
    const question = await prisma.question.findUniqueOrThrow({ where: { id: published.id } });
    const rewritten = `Second wording, entirely different. ${short()}`;

    const response = await http()
      .put(`/api/admin/content/questions/${published.id}`)
      .set({ cookie: admin })
      .send({
        slug: question.slug,
        roles: question.roles,
        levels: question.levels,
        type: question.type,
        topic_id: question.topicId,
        subtopic: question.subtopic,
        difficulty: question.difficulty,
        prompt: rewritten,
        context: null,
        rubric_id: question.rubricId,
        ideal_points: question.idealPoints,
      });
    expect(response.status).toBe(200);
    expect(worker.embedRequests.at(-1)?.texts).toEqual([rewritten]);

    // The new text is what the duplicate search now finds it by.
    const check = await http()
      .post("/api/admin/content/questions/duplicate-check")
      .set({ cookie: admin })
      .send({ prompt: rewritten, context: null, exclude_question_id: null });
    expect((check.body as { matches: { question_id: string }[] }).matches[0]?.question_id).toBe(
      published.id,
    );
  });

  it("does not embed a draft: only published questions are searched", async () => {
    const before = worker.embedRequests.length;
    const created = await http()
      .post("/api/admin/content/questions")
      .set({ cookie: admin })
      .send({
        slug: `embed-draft-${short()}`,
        roles: ["frontend"],
        levels: ["mid"],
        type: "technical",
        topic_id: topicId,
        subtopic: null,
        difficulty: 2,
        prompt: `A draft question. ${short()}`,
        context: null,
        rubric_id: rubricId,
        ideal_points: ["Something"],
      });
    questions.push((created.body as Question).id);
    expect(worker.embedRequests.length).toBe(before);
  });
});

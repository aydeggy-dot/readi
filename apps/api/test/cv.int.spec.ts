import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { CV_MAX_BYTES, CvResponse, CvUploadResponse } from "@readi/shared-types";
import type { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { CvParseProcessor } from "../src/cv/cv-parse.processor";
import { PrismaService } from "../src/prisma/prisma.service";
import { removeCataloguePair, seedCataloguePair, type CataloguePair } from "./content-fixtures";
import { REDIS } from "../src/redis/redis.module";
import { StorageService } from "../src/storage/storage.service";
import { FakeAiWorker, PARSED } from "./fake-ai-worker";
import { createTestApp, signUpWithEmail } from "./helpers";

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nA CV body that the fake worker never reads.");
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6]);

/** Minted per run: the catalogue is content, and the test database is never seeded (ADR-0015). */
let pair: CataloguePair;

const profileFor = (overrides: Record<string, unknown> = {}) => ({
  name: "Ada",
  target_role: pair.roleSlug,
  level: pair.levelSlug,
  years_experience: 3,
  target_stack: pair.stackSlug,
  technologies: ["Go"],
  target_company_type: "remote_foreign",
  target_date: null,
  ...overrides,
});

describe("CV upload and parsing", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  const worker = new FakeAiWorker();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ overrides: [[AiWorkerClient, worker]] });
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    pair = await seedCataloguePair(prisma);
  });
  afterAll(async () => {
    await removeCataloguePair(prisma, pair);
    await app.close();
  });
  beforeEach(() => {
    worker.outcome = "parsed";
  });

  async function candidate(withProfile = true): Promise<{ cookie: string; userId: string }> {
    const { cookie } = await signUpWithEmail(app);
    if (withProfile) await http().put("/api/me/profile").set("cookie", cookie).send(profileFor());
    const me = await http().get("/api/me").set("cookie", cookie);
    return { cookie, userId: (me.body as { id: string }).id };
  }

  async function upload(cookie: string, bytes: Uint8Array, declared = PDF): Promise<string> {
    const created = await http()
      .post("/api/me/cv/uploads")
      .set("cookie", cookie)
      .send({ content_type: declared, size_bytes: bytes.length });
    expect(created.status).toBe(200);
    const { upload_id, url, headers } = CvUploadResponse.parse(created.body);
    const put = await fetch(url, { method: "PUT", headers, body: bytes });
    expect(put.status).toBe(200);
    return upload_id;
  }

  const getCv = async (cookie: string) =>
    CvResponse.parse((await http().get("/api/me/cv").set("cookie", cookie)).body);

  async function settled(cookie: string): Promise<CvResponse> {
    for (let i = 0; i < 100; i++) {
      const cv = await getCv(cookie);
      if (cv.status !== "processing") return cv;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("CV still processing after 10 s");
  }

  it.each([
    ["get", "/api/me/cv"],
    ["post", "/api/me/cv/uploads"],
    ["post", "/api/me/cv"],
    ["put", "/api/me/cv/parsed"],
    ["delete", "/api/me/cv"],
  ] as const)("%s %s requires a session", async (method, path) => {
    expect((await http()[method](path).send({})).status).toBe(401);
  });

  it("sends no stack label for a candidate who chose no variant", async () => {
    // Null is a real answer, not a missing one (ADR-0015): the prompt then says nothing about a
    // stack rather than naming one nobody picked. The field still travels, so the worker's
    // contract does not change shape between two candidates.
    const { cookie } = await signUpWithEmail(app);
    await http()
      .put("/api/me/profile")
      .set("cookie", cookie)
      .send(profileFor({ target_stack: null }));
    const uploadId = await upload(cookie, PDF_BYTES);
    await http().post("/api/me/cv").set("cookie", cookie).send({ upload_id: uploadId });
    await settled(cookie);

    expect(worker.requests.at(-1)).toMatchObject({ stack_label: null });
  });

  it("starts empty and needs a profile before uploading", async () => {
    const { cookie } = await candidate(false);
    expect((await getCv(cookie)).status).toBe("none");
    const response = await http()
      .post("/api/me/cv/uploads")
      .set("cookie", cookie)
      .send({ content_type: PDF, size_bytes: 100 });
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "profile_required" });
  });

  it.each([
    ["too large", { content_type: PDF, size_bytes: CV_MAX_BYTES + 1 }],
    ["an unsupported type", { content_type: "application/msword", size_bytes: 100 }],
    ["empty", { content_type: PDF, size_bytes: 0 }],
  ])("refuses to sign an upload that is %s", async (_label, body) => {
    const { cookie } = await candidate();
    expect((await http().post("/api/me/cv/uploads").set("cookie", cookie).send(body)).status).toBe(
      400,
    );
  });

  it("uploads, parses in the background, records the AI call and stores the file", async () => {
    const { cookie, userId } = await candidate();
    const uploadId = await upload(cookie, PDF_BYTES);

    const confirmed = await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: uploadId });
    expect(confirmed.status).toBe(200);
    expect(CvResponse.parse(confirmed.body).status).toBe("processing");

    const cv = await settled(cookie);
    expect(cv).toMatchObject({ status: "parsed", content_type: PDF, error: null, parsed: PARSED });

    // The worker got the file and minimal context only.
    const sent = worker.requests.at(-1);
    // Labels, not keys (ADR-0015): the worker has no catalogue and no enum to recognise.
    expect(sent).toMatchObject({
      content_type: PDF,
      target_role_label: pair.roleName,
      level_label: pair.levelName,
      stack_label: pair.stackName,
    });
    expect(Buffer.from(sent?.file_base64 ?? "", "base64")).toEqual(Buffer.from(PDF_BYTES));
    expect(Object.keys(sent ?? {}).sort()).toEqual(
      [
        "content_type",
        "file_base64",
        "level_label",
        "request_id",
        "stack_label",
        "target_role_label",
        // The one identifier, and an opaque one: it goes on the Langfuse trace of the parse so
        // that account erasure can delete it again (ADR-0008), and reaches no prompt.
        "user_id",
      ].sort(),
    );
    expect(sent?.user_id).toBe(userId);

    const calls = await prisma.aiCallLog.findMany({ where: { userId } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      purpose: "cv_parse",
      model: "claude-sonnet-5",
      costMicroUsd: 16_000n,
    });

    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId } });
    expect(profile.cvFileKey).toBe(`cvs/${userId}/${uploadId}.pdf`);
    expect(await storage.size(profile.cvFileKey ?? "")).toBe(PDF_BYTES.length);
    expect(await storage.size(`cv-uploads/${uploadId}`)).toBeNull(); // quarantine emptied
  });

  it("rejects a file whose content does not match the declared type, and deletes it", async () => {
    const { cookie } = await candidate();
    const uploadId = await upload(cookie, DOCX_BYTES, PDF);
    const response = await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: uploadId });
    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ code: "invalid_file" });
    expect(await storage.size(`cv-uploads/${uploadId}`)).toBeNull();
    expect((await getCv(cookie)).status).toBe("none");
  });

  it("accepts a DOCX", async () => {
    const { cookie } = await candidate();
    const uploadId = await upload(cookie, DOCX_BYTES, DOCX);
    expect(
      (await http().post("/api/me/cv").set("cookie", cookie).send({ upload_id: uploadId })).status,
    ).toBe(200);
    expect((await settled(cookie)).content_type).toBe(DOCX);
  });

  it("will not confirm an upload that never arrived, or someone else's", async () => {
    const owner = await candidate();
    const created = await http()
      .post("/api/me/cv/uploads")
      .set("cookie", owner.cookie)
      .send({ content_type: PDF, size_bytes: 10 });
    const { upload_id } = CvUploadResponse.parse(created.body);

    const notUploaded = await http()
      .post("/api/me/cv")
      .set("cookie", owner.cookie)
      .send({ upload_id });
    expect(notUploaded.status).toBe(409);
    expect(notUploaded.body).toMatchObject({ code: "upload_incomplete" });

    const other = await candidate();
    const stolen = await http().post("/api/me/cv").set("cookie", other.cookie).send({ upload_id });
    expect(stolen.status).toBe(404);
    const unknown = await http()
      .post("/api/me/cv")
      .set("cookie", other.cookie)
      .send({ upload_id: randomUUID() });
    expect(unknown.status).toBe(404);
  });

  it("marks unreadable CVs and lets the candidate fill in the details", async () => {
    worker.outcome = "unreadable";
    const { cookie } = await candidate();
    await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: await upload(cookie, PDF_BYTES) });
    expect(await settled(cookie)).toMatchObject({
      status: "unreadable",
      error: "no_text",
      parsed: null,
    });

    const edited = await http().put("/api/me/cv/parsed").set("cookie", cookie).send(PARSED);
    expect(edited.status).toBe(200);
    const cv = CvResponse.parse(edited.body);
    expect(cv).toMatchObject({ status: "parsed", error: null, parsed: PARSED });
    expect(cv.edited_at).not.toBeNull();
  });

  it("validates edits and refuses them while there is nothing to edit", async () => {
    const { cookie } = await candidate();
    expect((await http().put("/api/me/cv/parsed").set("cookie", cookie).send(PARSED)).status).toBe(
      409,
    );
    const invalid = { ...PARSED, experience: [{ ...PARSED.experience[0], start: "January 2024" }] };
    expect((await http().put("/api/me/cv/parsed").set("cookie", cookie).send(invalid)).status).toBe(
      400,
    );
  });

  it("retries when the worker is unavailable, then marks the CV failed", async () => {
    const { cookie, userId } = await candidate();
    const processor = app.get(CvParseProcessor);
    // Put the CV in `processing` without queueing, then run the job by hand.
    const fileKey = `cvs/${userId}/manual.pdf`;
    await prisma.profile.update({
      where: { userId },
      data: { cvStatus: "processing", cvFileKey: fileKey, cvContentType: PDF },
    });
    await storage.copy(await putQuarantine(PDF_BYTES), fileKey, PDF);
    worker.outcome = "unavailable";

    await expect(processor.process({ userId, fileKey }, { finalAttempt: false })).rejects.toThrow();
    expect((await getCv(cookie)).status).toBe("processing");
    await processor.process({ userId, fileKey }, { finalAttempt: true });
    expect(await getCv(cookie)).toMatchObject({ status: "failed", error: "worker_unavailable" });
  });

  it("replaces the previous CV file and ignores stale jobs", async () => {
    const { cookie, userId } = await candidate();
    await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: await upload(cookie, PDF_BYTES) });
    await settled(cookie);
    const first = (await prisma.profile.findUniqueOrThrow({ where: { userId } })).cvFileKey ?? "";

    await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: await upload(cookie, PDF_BYTES) });
    await settled(cookie);
    expect(await storage.size(first)).toBeNull();

    const before = worker.requests.length;
    await app.get(CvParseProcessor).process({ userId, fileKey: first }, { finalAttempt: true });
    expect(worker.requests.length).toBe(before); // stale job: no worker call
  });

  it("deletes the CV file and everything parsed from it", async () => {
    const { cookie, userId } = await candidate();
    await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: await upload(cookie, PDF_BYTES) });
    await settled(cookie);
    const key = (await prisma.profile.findUniqueOrThrow({ where: { userId } })).cvFileKey ?? "";

    const removed = await http().delete("/api/me/cv").set("cookie", cookie);
    expect(CvResponse.parse(removed.body)).toMatchObject({
      status: "none",
      parsed: null,
      uploaded_at: null,
    });
    expect(await storage.size(key)).toBeNull();
  });

  it("refuses a confirm whose CV changed underneath it, keeping the CV that won", async () => {
    const { cookie, userId } = await candidate();
    const first = await upload(cookie, PDF_BYTES);
    await http().post("/api/me/cv").set("cookie", cookie).send({ upload_id: first }).expect(200);
    const settledCv = await settled(cookie);
    expect(settledCv.status).toBe("parsed");
    const live = await prisma.profile.findUniqueOrThrow({ where: { userId } });

    // Force the race the check exists for: another upload wins while this confirm is copying.
    const second = await upload(cookie, PDF_BYTES);
    const copy = storage.copy.bind(storage);
    const spy = vi.spyOn(storage, "copy").mockImplementationOnce(async (from, to, contentType) => {
      await copy(from, to, contentType);
      await prisma.profile.update({
        where: { userId },
        data: { cvFileKey: `${live.cvFileKey ?? ""}-won-the-race` },
      });
    });
    const response = await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: second });
    spy.mockRestore();

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "cv_changed" });
    // The losing confirm cleaned up only its own file and left the winner's alone.
    expect(await storage.size(live.cvFileKey ?? "")).not.toBeNull();
  });

  it("caps how many upload URLs a user can ask for", async () => {
    const { cookie, userId } = await candidate();
    await app.get<Redis>(REDIS).set(`ratelimit:cv-upload:${userId}`, "10", "EX", 3600);
    const response = await http()
      .post("/api/me/cv/uploads")
      .set("cookie", cookie)
      .send({ content_type: PDF, size_bytes: PDF_BYTES.length });
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: "rate_limited" });
  });

  it("caps how many CVs a user can have parsed per day", async () => {
    const { cookie, userId } = await candidate();
    await app.get<Redis>(REDIS).set(`ratelimit:cv-parse-day:${userId}`, "15", "EX", 86_400);
    const uploadId = await upload(cookie, PDF_BYTES);
    const response = await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: uploadId });
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: "rate_limited" });
  });

  it("does not spend a parse allowance when the file has not arrived", async () => {
    const { cookie, userId } = await candidate();
    const created = await http()
      .post("/api/me/cv/uploads")
      .set("cookie", cookie)
      .send({ content_type: PDF, size_bytes: PDF_BYTES.length });
    const { upload_id } = CvUploadResponse.parse(created.body);

    // Confirmed before the browser finished the PUT: retryable, so it must not cost an allowance.
    const early = await http().post("/api/me/cv").set("cookie", cookie).send({ upload_id });
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ code: "upload_incomplete" });
    expect(await app.get<Redis>(REDIS).get(`ratelimit:cv-parse-hour:${userId}`)).toBeNull();
  });

  it("caps how many CVs a user can have parsed per hour", async () => {
    const { cookie, userId } = await candidate();
    await app.get<Redis>(REDIS).set(`ratelimit:cv-parse-hour:${userId}`, "5", "EX", 3600);
    const uploadId = await upload(cookie, PDF_BYTES);
    const response = await http()
      .post("/api/me/cv")
      .set("cookie", cookie)
      .send({ upload_id: uploadId });
    expect(response.status).toBe(429);
    expect(response.body).toMatchObject({ code: "rate_limited" });
  });

  async function putQuarantine(bytes: Uint8Array): Promise<string> {
    const key = `cv-uploads/${randomUUID()}`;
    const signed = await storage.presignPut(key, PDF, bytes.length, 60);
    await fetch(signed.url, { method: "PUT", headers: signed.headers, body: bytes });
    return key;
  }
});

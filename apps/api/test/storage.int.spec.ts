import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env";
import { QUARANTINE_PREFIX, setUpBucket, StorageService } from "../src/storage/storage.service";

const PDF = "application/pdf";

describe("object storage (SeaweedFS locally, R2 in production)", () => {
  const env = parseEnv(process.env);
  const storage = new StorageService(env);
  const key = () => `${QUARANTINE_PREFIX}${randomUUID()}`;
  const put = (url: string, body: Uint8Array, contentType = PDF) =>
    fetch(url, { method: "PUT", headers: { "content-type": contentType }, body });

  it("sets up the bucket idempotently", async () => {
    const steps = await setUpBucket(env);
    expect(steps.some((s) => s.startsWith("CORS"))).toBe(true);
    expect(steps.some((s) => s.startsWith("lifecycle"))).toBe(true);
  });

  it("accepts an upload of exactly the signed type and size, and reads it back", async () => {
    const body = new TextEncoder().encode("%PDF-1.7 hello");
    const target = key();
    const upload = await storage.presignPut(target, PDF, body.length, 60);

    expect((await put(upload.url, body)).status).toBe(200);
    expect(await storage.size(target)).toBe(body.length);
    expect(new TextDecoder().decode(await storage.readStart(target, 5))).toBe("%PDF-");

    await storage.delete(target);
    expect(await storage.size(target)).toBeNull();
  });

  it("rejects an upload whose size differs from the signed size", async () => {
    const target = key();
    const upload = await storage.presignPut(target, PDF, 10, 60);
    const response = await put(upload.url, new Uint8Array(2000));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await storage.size(target)).toBeNull();
  });

  it("rejects an upload with a different content type", async () => {
    const target = key();
    const body = new Uint8Array(10);
    const upload = await storage.presignPut(target, PDF, body.length, 60);
    const response = await put(upload.url, body, "text/html");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await storage.size(target)).toBeNull();
  });

  it("allows browser uploads from the web origin only (CORS preflight)", async () => {
    const upload = await storage.presignPut(key(), PDF, 10, 60);
    const preflight = (origin: string) =>
      fetch(upload.url, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "PUT",
          "access-control-request-headers": "content-type",
        },
      });
    const allowed = await preflight(env.PUBLIC_WEB_URL);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(env.PUBLIC_WEB_URL);
    const other = await preflight("https://evil.example");
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });
});

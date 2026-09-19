import type { CvParseRequest, CvParseResponse } from "@readi/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { AiWorkerUnavailableError, HttpAiWorkerClient } from "./ai-worker.client";

const env = {
  AI_WORKER_URL: "http://worker.test",
  AI_WORKER_TOKEN: "w".repeat(32),
  AI_WORKER_TIMEOUT_MS: 5000,
} as Env;

const request: CvParseRequest = {
  request_id: "3f1a1a1e-0f0e-4b3e-9c3e-2d2b1a0f0e0d",
  content_type: "application/pdf",
  file_base64: "JVBERi0=",
  target_role: "backend",
  level: "mid",
};

const response: CvParseResponse = {
  request_id: request.request_id,
  status: "parsed",
  parsed: { skills: ["Go"], projects: [], experience: [], gaps: [] },
  error: null,
  ai_calls: [],
};

/** Replaces global fetch for one test and returns the calls it received. */
function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal("fetch", (input: URL | string, init: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(handler(String(input), init));
  });
  return calls;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("HttpAiWorkerClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to the worker with the service token and returns the parsed response", async () => {
    const calls = stubFetch(() => json(response));
    const result = await new HttpAiWorkerClient(env).parseCv(request);

    expect(result).toEqual(response);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("http://worker.test/cv/parse");
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: `Bearer ${env.AI_WORKER_TOKEN}`,
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(request);
  });

  it.each([
    ["the worker answers 500", () => json({ detail: "boom" }, 500)],
    ["the worker answers 401", () => json({ detail: "unauthorized" }, 401)],
    ["the response does not match the contract", () => json({ request_id: "not-a-uuid" })],
    [
      "the connection fails",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("reports the worker unavailable when %s", async (_label, handler) => {
    stubFetch(handler as () => Response);
    await expect(new HttpAiWorkerClient(env).parseCv(request)).rejects.toBeInstanceOf(
      AiWorkerUnavailableError,
    );
  });

  it("never puts the worker's error body in the error message", async () => {
    stubFetch(() => json({ detail: "candidate CV text that must not travel" }, 500));
    await expect(new HttpAiWorkerClient(env).parseCv(request)).rejects.toThrow(
      /^worker answered HTTP 500$/,
    );
  });
});

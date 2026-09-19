import { describe, expect, it, vi } from "vitest";
import { fetchApiHealth } from "./api-health";

const healthy = {
  status: "ok",
  service: "api",
  checks: { database: { status: "ok", latency_ms: 3 }, redis: { status: "ok", latency_ms: 1 } },
};

const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

describe("fetchApiHealth", () => {
  it("returns the parsed health body", async () => {
    const fetchImpl = respond(healthy);

    await expect(fetchApiHealth("http://api", fetchImpl)).resolves.toEqual({
      reachable: true,
      latency_ms: expect.any(Number) as number,
      health: healthy,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api/health",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("parses the body of a 503 so failing checks can be shown", async () => {
    const degraded = {
      ...healthy,
      status: "error",
      checks: {
        ...healthy.checks,
        database: { status: "error", latency_ms: 2000, error: "timeout" },
      },
    };

    const result = await fetchApiHealth("http://api", respond(degraded, 503));

    expect(result).toMatchObject({ reachable: true, health: degraded });
  });

  it("treats a network failure as unreachable", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed")));

    await expect(fetchApiHealth("http://api", fetchImpl)).resolves.toEqual({ reachable: false });
  });

  it("treats a body that violates the contract as unreachable", async () => {
    await expect(fetchApiHealth("http://api", respond({ hello: "world" }))).resolves.toEqual({
      reachable: false,
    });
  });
});

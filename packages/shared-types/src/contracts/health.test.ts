import { describe, expect, it } from "vitest";
import { HealthResponse } from "./health.js";

describe("HealthResponse", () => {
  it("accepts a healthy response", () => {
    const body = {
      status: "ok",
      service: "api",
      checks: { database: { status: "ok", latency_ms: 3 }, redis: { status: "ok", latency_ms: 1 } },
    };
    expect(HealthResponse.parse(body)).toEqual(body);
  });

  it("accepts a failed check with an error code", () => {
    const body = {
      status: "error",
      service: "ai-worker",
      checks: { redis: { status: "error", latency_ms: 2000, error: "timeout" } },
    };
    expect(HealthResponse.parse(body)).toEqual(body);
  });

  it("rejects free-text error details", () => {
    const body = {
      status: "error",
      service: "api",
      checks: {
        database: { status: "error", latency_ms: 5, error: "connect ECONNREFUSED 10.0.0.5" },
      },
    };
    expect(HealthResponse.safeParse(body).success).toBe(false);
  });

  it("rejects fractional latency", () => {
    const body = {
      status: "ok",
      service: "api",
      checks: { redis: { status: "ok", latency_ms: 1.5 } },
    };
    expect(HealthResponse.safeParse(body).success).toBe(false);
  });
});

import type { HealthResponse } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { buildStatusRows } from "./status-rows";

const healthy: HealthResponse = {
  status: "ok",
  service: "api",
  checks: { database: { status: "ok", latency_ms: 3 }, redis: { status: "ok", latency_ms: 1 } },
};

describe("buildStatusRows", () => {
  it("shows every row healthy with latencies", () => {
    const rows = buildStatusRows({ reachable: true, latency_ms: 12, health: healthy });

    expect(rows).toEqual([
      { id: "api", label: "API", ok: true, detail: "12 ms" },
      { id: "database", label: "Database", ok: true, detail: "3 ms" },
      { id: "redis", label: "Redis", ok: true, detail: "1 ms" },
    ]);
  });

  it.each([
    ["unreachable", "Unreachable"],
    ["timeout", "Timed out"],
    ["not_migrated", "Migrations pending"],
  ] as const)("translates the %s error code", (error, message) => {
    const health: HealthResponse = {
      ...healthy,
      status: "error",
      checks: { ...healthy.checks, database: { status: "error", latency_ms: 5, error } },
    };

    const database = buildStatusRows({ reachable: true, latency_ms: 9, health })[1];

    expect(database).toMatchObject({ id: "database", ok: false, detail: message });
  });

  it("marks a check the API did not report as failing", () => {
    const health: HealthResponse = {
      ...healthy,
      checks: { database: { status: "ok", latency_ms: 3 } },
    };

    expect(buildStatusRows({ reachable: true, latency_ms: 9, health })[2]).toMatchObject({
      id: "redis",
      ok: false,
      detail: "Not reported",
    });
  });

  it("marks everything unreachable when the API cannot be reached", () => {
    const rows = buildStatusRows({ reachable: false });

    expect(rows.map((row) => [row.id, row.ok, row.detail])).toEqual([
      ["api", false, "Unreachable"],
      ["database", false, "Unreachable"],
      ["redis", false, "Unreachable"],
    ]);
  });
});

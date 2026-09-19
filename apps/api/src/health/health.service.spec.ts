import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { HealthService, type Pingable } from "./health.service";

function fakePrisma(options: { vector?: boolean; tableError?: Error; queryError?: Error } = {}) {
  return {
    $queryRaw: vi.fn(() =>
      options.queryError
        ? Promise.reject(options.queryError)
        : Promise.resolve([{ installed: options.vector ?? true }]),
    ),
    healthCheck: {
      count: vi.fn(() =>
        options.tableError ? Promise.reject(options.tableError) : Promise.resolve(0),
      ),
    },
  } as unknown as PrismaService;
}

const okRedis: Pingable = { ping: () => Promise.resolve("PONG") };

function service(prisma: PrismaService, redis: Pingable = okRedis, timeoutMs = 100) {
  return new HealthService(prisma, redis, { HEALTH_CHECK_TIMEOUT_MS: timeoutMs });
}

describe("HealthService", () => {
  it("reports ok when the database and redis are healthy", async () => {
    const result = await service(fakePrisma()).check();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("api");
    expect(result.checks.database).toMatchObject({ status: "ok" });
    expect(result.checks.redis).toMatchObject({ status: "ok" });
  });

  it("reports not_migrated when pgvector is missing", async () => {
    const result = await service(fakePrisma({ vector: false })).check();

    expect(result.status).toBe("error");
    expect(result.checks.database).toMatchObject({ status: "error", error: "not_migrated" });
  });

  it("reports not_migrated when the health_check table does not exist", async () => {
    const tableMissing = Object.assign(new Error("table missing"), { code: "P2021" });
    const result = await service(fakePrisma({ tableError: tableMissing })).check();

    expect(result.checks.database).toMatchObject({ status: "error", error: "not_migrated" });
  });

  it("reports unreachable when the database connection fails", async () => {
    const result = await service(
      fakePrisma({ queryError: new Error("ECONNREFUSED 127.0.0.1:15432") }),
    ).check();

    expect(result.checks.database).toMatchObject({ status: "error", error: "unreachable" });
    expect(Number.isInteger(result.checks.database?.latency_ms)).toBe(true);
  });

  it("reports redis failures independently of the database", async () => {
    const redis: Pingable = { ping: () => Promise.reject(new Error("Connection is closed.")) };
    const result = await service(fakePrisma(), redis).check();

    expect(result.status).toBe("error");
    expect(result.checks.database).toMatchObject({ status: "ok" });
    expect(result.checks.redis).toMatchObject({ status: "error", error: "unreachable" });
  });

  it("times out a hanging dependency", async () => {
    const redis: Pingable = { ping: () => new Promise(() => {}) };
    const result = await service(fakePrisma(), redis, 20).check();

    expect(result.checks.redis).toMatchObject({ status: "error", error: "timeout" });
  });
});

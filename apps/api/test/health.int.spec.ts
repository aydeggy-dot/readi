import type { NestExpressApplication } from "@nestjs/platform-express";
import { HealthResponse } from "@readi/shared-types";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { REDIS } from "../src/redis/redis.module";
import { createTestApp } from "./helpers";

// Integration: real Nest module graph against the Postgres and Redis from infra/docker-compose.yml
// (or CI service containers); the test database is migrated by test/global-setup.ts.
describe("GET /health", () => {
  let app: NestExpressApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(overrideRedis?: object): Promise<NestExpressApplication> {
    app = await createTestApp({ overrides: overrideRedis ? [[REDIS, overrideRedis]] : [] });
    return app;
  }

  it("returns 200 and a contract-valid body when dependencies are up", async () => {
    const response = await request((await start()).getHttpServer()).get("/health");

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const body = HealthResponse.parse(response.body);
    expect(body.checks.database?.status).toBe("ok");
    expect(body.checks.redis?.status).toBe("ok");
  });

  it("returns 503 with a contract-valid body when a dependency is down", async () => {
    const downRedis = {
      ping: () => Promise.reject(new Error("Connection is closed.")),
      disconnect: () => undefined,
    };
    const response = await request((await start(downRedis)).getHttpServer()).get("/health");

    expect(response.status).toBe(503);
    const body = HealthResponse.parse(response.body);
    expect(body.status).toBe("error");
    expect(body.checks.redis).toMatchObject({ status: "error", error: "unreachable" });
  });
});

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { HealthResponse } from "@readi/shared-types";
import request from "supertest";
import type { App } from "supertest/types";
import { afterEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { parseEnv } from "../src/config/env";
import { REDIS } from "../src/redis/redis.module";

// Integration: real Nest module graph against the Postgres and Redis from infra/docker-compose.yml
// (or CI service containers). Requires migrations: `pnpm db:migrate` locally, `db:deploy` in CI.
describe("GET /health", () => {
  let app: INestApplication<App> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(overrideRedis?: object): Promise<INestApplication<App>> {
    let builder = Test.createTestingModule({
      imports: [AppModule.register(parseEnv(process.env))],
    });
    if (overrideRedis) builder = builder.overrideProvider(REDIS).useValue(overrideRedis);
    const moduleRef = await builder.compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
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

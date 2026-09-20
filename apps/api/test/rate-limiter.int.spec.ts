import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { RedisRateLimiter } from "../src/rate-limit/redis-rate-limiter";

describe("RedisRateLimiter", () => {
  const redis = new Redis(process.env.REDIS_URL ?? "");
  const limiter = new RedisRateLimiter(redis, `test:${randomUUID()}:`);
  afterAll(() => redis.quit());

  it("allows up to max requests per window, then reports retryAfter", async () => {
    const rule = { window: 60, max: 3 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.consume("k", rule));

    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3]).toMatchObject({ allowed: false });
    expect(results[3]?.retryAfter).toBeGreaterThan(0);
  });

  it("counts atomically under concurrency", async () => {
    const rule = { window: 60, max: 5 };
    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume("burst", rule)),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });
});

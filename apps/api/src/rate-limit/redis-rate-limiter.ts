import type { Redis } from "ioredis";

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window frees up; null when allowed. */
  retryAfter: number | null;
}

// Fixed window, counted atomically: INCR and the first EXPIRE happen in one script, so concurrent
// requests cannot all slip past a stale read (the contract Better Auth's custom storage requires).
const CONSUME = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if count > tonumber(ARGV[2]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
  return {0, ttl}
end
return {1, -1}
`;

/** Redis-backed rate limiter shared by Better Auth (auth routes) and our own caps (OTP per number). */
export class RedisRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = "ratelimit:",
  ) {}

  async consume(key: string, rule: { window: number; max: number }): Promise<RateLimitResult> {
    const [allowed, ttl] = (await this.redis.eval(
      CONSUME,
      1,
      `${this.prefix}${key}`,
      rule.window,
      rule.max,
    )) as [number, number];
    return allowed === 1
      ? { allowed: true, retryAfter: null }
      : { allowed: false, retryAfter: ttl };
  }
}

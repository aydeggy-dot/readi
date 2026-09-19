import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../redis/redis.module";

export interface DevMailboxEntry {
  channel: "email" | "sms";
  to: string;
  subject?: string;
  body: string;
  created_at: string;
}

const KEEP = 20;
const TTL_SECONDS = 3600;

/**
 * Development/test-only inbox for messages the console email/SMS providers "send", so developers
 * and e2e tests can read OTPs and verification links. The module is never imported in production.
 */
@Injectable()
export class DevMailboxService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(to: string): string {
    return `dev-mailbox:${to.trim().toLowerCase()}`;
  }

  async record(entry: Omit<DevMailboxEntry, "created_at">): Promise<void> {
    const key = this.key(entry.to);
    const value = JSON.stringify({ ...entry, created_at: new Date().toISOString() });
    await this.redis
      .multi()
      .lpush(key, value)
      .ltrim(key, 0, KEEP - 1)
      .expire(key, TTL_SECONDS)
      .exec();
  }

  /** Newest first. */
  async list(to: string): Promise<DevMailboxEntry[]> {
    const raw = await this.redis.lrange(this.key(to), 0, KEEP - 1);
    return raw.map((item) => JSON.parse(item) as DevMailboxEntry);
  }
}

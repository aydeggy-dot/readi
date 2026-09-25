import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { InterviewSessionsRepository } from "./interview-sessions.repository";

export const STALE_SESSIONS_QUEUE = "stale-interviews";
const SWEEP_EVERY_MS = 10 * 60 * 1000;

/**
 * Marks interviews nobody came back to as `abandoned`.
 *
 * Pause and resume are lifecycle rather than states: leaving the page pauses, and returning before
 * the wall-clock deadline resumes. This is what closes the other case — the session whose deadline
 * passed while the tab was shut. It runs every ten minutes because the shortest session is fifteen,
 * so a sweep is never the thing a candidate is waiting on.
 *
 * A sweep over the database rather than a delayed job per session, for the reason
 * `AccountErasureQueue` gives: the database stays the only record of what is due, nothing is lost
 * if Redis is flushed, a failed sweep is retried by the next one, and a session that completed
 * needs no job cancelled.
 */
@Injectable()
export class StaleSessionsQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StaleSessionsQueue.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly repository: InterviewSessionsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.env.JOBS_ENABLED) return;
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    const prefix = this.env.QUEUE_PREFIX;
    this.queue = new Queue(STALE_SESSIONS_QUEUE, {
      connection,
      prefix,
      defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
    });
    // Idempotent: every API instance upserts the same scheduler, so there is one sweep per period.
    await this.queue.upsertJobScheduler(
      "stale-sweep",
      { every: SWEEP_EVERY_MS },
      { name: "sweep" },
    );
    this.worker = new Worker(STALE_SESSIONS_QUEUE, () => this.sweep(), {
      connection,
      prefix,
      concurrency: 1,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`stale interview sweep ${job?.id ?? "?"} failed: ${error.name}`);
    });
  }

  /** Ids and counts only: a session id is not personal data, and nothing else is logged. */
  private async sweep(): Promise<void> {
    const abandoned = await this.repository.abandonStale(new Date());
    if (abandoned > 0) this.logger.log(`abandoned ${abandoned} stale interview(s)`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

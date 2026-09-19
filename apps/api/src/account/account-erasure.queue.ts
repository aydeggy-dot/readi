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
import { AccountDeletionService } from "./account-deletion.service";

export const ACCOUNT_ERASURE_QUEUE = "account-erasure";
const SWEEP_EVERY_MS = 60 * 60 * 1000;

/**
 * Runs the erasure sweep hourly (ADR-0011). A sweep, rather than one delayed job per user, keeps
 * the database the only record of what is due: nothing is lost if Redis is flushed, a sweep that
 * fails is simply retried by the next one, and a cancelled deletion needs no job removed.
 */
@Injectable()
export class AccountErasureQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountErasureQueue.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly deletion: AccountDeletionService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.env.JOBS_ENABLED) return;
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    const prefix = this.env.QUEUE_PREFIX;
    this.queue = new Queue(ACCOUNT_ERASURE_QUEUE, {
      connection,
      prefix,
      defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
    });
    // Idempotent: every API instance upserts the same scheduler, so there is one sweep per hour.
    await this.queue.upsertJobScheduler(
      "hourly-sweep",
      { every: SWEEP_EVERY_MS },
      { name: "sweep" },
    );
    this.worker = new Worker(ACCOUNT_ERASURE_QUEUE, () => this.deletion.eraseDue(), {
      connection,
      prefix,
      concurrency: 1,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`account erasure sweep ${job?.id ?? "?"} failed: ${error.name}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

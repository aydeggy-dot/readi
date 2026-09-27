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
import { EvaluationsService } from "./evaluations.service";

export const EVALUATION_SWEEP_QUEUE = "evaluation-sweep";
const SWEEP_EVERY_MS = 10 * 60 * 1000;
/**
 * How long a session gets to be scored by the ordinary path before the sweep takes an interest.
 * Comfortably longer than a 30-minute session's eight evaluator calls at `EVALUATION_CONCURRENCY`,
 * so a sweep never races a job that is simply still running.
 */
const SWEEP_GRACE_MS = 15 * 60 * 1000;
/**
 * Sessions per sweep. A day's worth of lost enqueues found at once should drain over several sweeps
 * rather than opening a hundred paid requests in a minute — and at ten minutes a sweep, twenty at a
 * time clears a backlog of a thousand inside a day without anyone watching it.
 */
const SWEEP_BATCH = 20;

/**
 * Finds ended interviews that were never scored, and queues them.
 *
 * **Why this exists at all.** The ordinary enqueue happens after the SSE stream closes and is logged
 * rather than raised, because ADR-0016 forbids anything between `open()` and `close()` from throwing —
 * so it can be lost, and nothing else would ever notice. `GET /api/interviews/:id/report` recovers one
 * when a candidate opens it, which is the cheapest recovery there is; this is the half that does not
 * depend on anybody looking. A candidate who never opens their report would otherwise go unscored for
 * good, and that is worse than a missing page: `weakTopics` reads `answer_evaluations`, so an unscored
 * session silently degrades the *next* interview's question selection, and M6's readiness score is
 * computed from stored scores, where a gap is a wrong number rather than a blank one.
 *
 * A sweep over the **database** rather than a delayed job per session, for the reason
 * `AccountErasureQueue` and `StaleSessionsQueue` both give: the database stays the only record of what
 * is due, nothing is lost if Redis is flushed, and a sweep that fails is retried by the next one.
 *
 * It cannot pay twice for the same refusal. `EvaluationsRepository.endedWithoutReport` explains why in
 * full; the short version is that a session whose answers all refused still gets a `failed` report row,
 * and an answer that has a row is never re-scored — so the only thing this can spend money on is a
 * session that was never evaluated, which is exactly what it is looking for.
 */
@Injectable()
export class EvaluationSweepQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvaluationSweepQueue.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly evaluations: EvaluationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.env.JOBS_ENABLED) return;
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    const prefix = this.env.QUEUE_PREFIX;
    this.queue = new Queue(EVALUATION_SWEEP_QUEUE, {
      connection,
      prefix,
      defaultJobOptions: { removeOnComplete: { count: 100 }, removeOnFail: { count: 100 } },
    });
    // Idempotent: every API instance upserts the same scheduler, so there is one sweep per period.
    await this.queue.upsertJobScheduler(
      "evaluation-sweep",
      { every: SWEEP_EVERY_MS },
      { name: "sweep" },
    );
    this.worker = new Worker(EVALUATION_SWEEP_QUEUE, () => this.sweep(), {
      connection,
      prefix,
      concurrency: 1,
    });
    this.worker.on("failed", (job, error) => {
      this.logger.error(`evaluation sweep ${job?.id ?? "?"} failed: ${error.name}`);
    });
  }

  /** Ids and counts only; the service logs the count, and nothing a candidate wrote is read here. */
  async sweep(now: Date = new Date()): Promise<string[]> {
    return this.evaluations.sweepUnreported(new Date(now.getTime() - SWEEP_GRACE_MS), SWEEP_BATCH);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

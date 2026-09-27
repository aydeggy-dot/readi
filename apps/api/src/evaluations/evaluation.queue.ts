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
import { type EvaluationJob, EvaluationProcessor } from "./evaluation.processor";
import { EvaluationJobs } from "./evaluations.service";

export const EVALUATION_QUEUE = "evaluate-session";

/**
 * BullMQ queue for scoring an ended session, on the `cv-parse.queue.ts` pattern.
 *
 * Jobs carry ids only. Transport failures are retried with exponential backoff and the processor is
 * told which attempt is the last, so the final one stores an honest `failed` rather than leaving a
 * session with no report. Concurrency here is **sessions at a time**; the fan-out over an individual
 * session's answers is the processor's, bounded by `EVALUATION_CONCURRENCY`, so a busy evening cannot
 * multiply the two into a paid stampede.
 */
@Injectable()
export class EvaluationQueue extends EvaluationJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvaluationQueue.name);
  private queue?: Queue<EvaluationJob>;
  private worker?: Worker<EvaluationJob>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly processor: EvaluationProcessor,
  ) {
    super();
  }

  onModuleInit(): void {
    // BullMQ opens its own connections; blocking commands need maxRetriesPerRequest: null.
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    const prefix = this.env.QUEUE_PREFIX;
    this.queue = new Queue<EvaluationJob>(EVALUATION_QUEUE, {
      connection,
      prefix,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 1000 },
      },
    });
    if (!this.env.JOBS_ENABLED) return;
    this.worker = new Worker<EvaluationJob>(
      EVALUATION_QUEUE,
      (job) =>
        this.processor.process(job.data, {
          finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        }),
      { connection, prefix, concurrency: 2 },
    );
    this.worker.on("failed", (job, error) => {
      this.logger.warn(`evaluation job ${job?.id ?? "?"} attempt failed: ${error.name}`);
    });
  }

  /**
   * Queues one session, **and drops a job that has already finished under the same id first.**
   *
   * The job id is the session id, so two doors closing at once — a final exchange and the stale sweep
   * racing — enqueue one job rather than two. That is the whole reason for the custom id, and it is
   * about jobs that are *in flight*.
   *
   * A finished job is different, and getting this wrong made phase 4's recovery a no-op: BullMQ keeps
   * completed jobs (`removeOnComplete: { count: 1000 }`) and silently returns the existing job instead
   * of adding a new one, so re-queueing a session it had already scored did nothing at all — the report
   * route answered "still being scored" for ever and the sweep queued into a void. A completed or
   * failed job is removed and replaced; a waiting, delayed or active one is left alone, which keeps the
   * dedupe exactly where it was meant to be.
   */
  async enqueue(job: EvaluationJob, jobId: string): Promise<void> {
    if (!this.queue) throw new Error("EvaluationQueue used before initialisation");
    const existing = await this.queue.getJob(jobId);
    if (existing && ((await existing.isCompleted()) || (await existing.isFailed()))) {
      await existing.remove();
    }
    await this.queue.add("evaluate", job, { jobId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

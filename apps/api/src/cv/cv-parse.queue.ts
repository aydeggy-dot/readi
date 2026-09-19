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
import { CvParseProcessor } from "./cv-parse.processor";
import { type CvParseJob, CvParseJobs } from "./cv.service";

export const CV_PARSE_QUEUE = "cv-parse";

/**
 * BullMQ queue for CV parsing. Jobs carry ids only. Transport failures are retried with backoff;
 * after the last attempt the CV is marked failed. The worker runs in the API process when
 * JOBS_ENABLED (it can move to a separate process later without changing callers).
 */
@Injectable()
export class CvParseQueue extends CvParseJobs implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CvParseQueue.name);
  private queue?: Queue<CvParseJob>;
  private worker?: Worker<CvParseJob>;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly processor: CvParseProcessor,
  ) {
    super();
  }

  onModuleInit(): void {
    // BullMQ opens its own connections; blocking commands need maxRetriesPerRequest: null.
    const connection = { url: this.env.REDIS_URL, maxRetriesPerRequest: null };
    const prefix = this.env.QUEUE_PREFIX;
    this.queue = new Queue<CvParseJob>(CV_PARSE_QUEUE, {
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
    this.worker = new Worker<CvParseJob>(
      CV_PARSE_QUEUE,
      (job) =>
        this.processor.process(job.data, {
          finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        }),
      { connection, prefix, concurrency: 2 },
    );
    this.worker.on("failed", (job, error) => {
      this.logger.warn(`cv-parse job ${job?.id ?? "?"} attempt failed: ${error.name}`);
    });
  }

  async enqueue(job: CvParseJob, jobId: string): Promise<void> {
    if (!this.queue) throw new Error("CvParseQueue used before initialisation");
    await this.queue.add("parse", job, { jobId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }
}

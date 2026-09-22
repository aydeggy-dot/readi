import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { CvContentType } from "@readi/shared-types";
import { AiCallLogService } from "../ai-calls/ai-call-log.service";
import { AiWorkerClient } from "../ai-worker/ai-worker.client";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { CvParseJob } from "./cv.service";

/** Runs one CV parse job: stored file → worker → ai_call_log + profile. */
@Injectable()
export class CvParseProcessor {
  private readonly logger = new Logger(CvParseProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly worker: AiWorkerClient,
    private readonly aiCalls: AiCallLogService,
  ) {}

  async process(job: CvParseJob, { finalAttempt }: { finalAttempt: boolean }): Promise<void> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId: job.userId },
      // The worker is sent the role and level as words, not keys (ADR-0015): it has no catalogue
      // and, with roles as content, no enum it could have been taught to recognise.
      include: { targetRole: { select: { name: true } }, targetLevel: { select: { name: true } } },
    });
    // Replaced or deleted since the job was queued: nothing to do.
    if (profile?.cvFileKey !== job.fileKey || profile.cvStatus !== "processing") return;
    try {
      const file = await this.storage.read(job.fileKey);
      const result = await this.worker.parseCv({
        request_id: randomUUID(),
        content_type: CvContentType.parse(profile.cvContentType),
        file_base64: Buffer.from(file).toString("base64"),
        // Minimal context only (ADR-0004): no name, email or phone.
        target_role_label: profile.targetRole.name,
        level_label: profile.targetLevel.name,
      });
      await this.aiCalls.record(result.ai_calls, { userId: job.userId });
      await this.prisma.profile.updateMany({
        where: { userId: job.userId, cvFileKey: job.fileKey },
        data: {
          cvStatus: result.status,
          cvParsed: result.parsed ?? Prisma.DbNull,
          cvParsedAt: result.status === "parsed" ? new Date() : null,
          cvError: result.error,
        },
      });
    } catch (error) {
      if (!finalAttempt) throw error;
      this.logger.warn(
        `cv parse gave up for user ${job.userId}: ${error instanceof Error ? error.name : "error"}`,
      );
      await this.prisma.profile.updateMany({
        where: { userId: job.userId, cvFileKey: job.fileKey },
        data: { cvStatus: "failed", cvError: "worker_unavailable" },
      });
    }
  }
}

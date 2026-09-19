import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  CV_MAX_BYTES,
  CvContentType,
  CvParseError,
  type CreateCvUploadRequest,
  type CvResponse,
  type CvUploadResponse,
  ParsedCv,
} from "@readi/shared-types";
import type { Redis } from "ioredis";
import { Prisma, type Profile } from "../generated/prisma/client";
import { ApiError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { RedisRateLimiter } from "../rate-limit/redis-rate-limiter";
import { REDIS } from "../redis/redis.module";
import { QUARANTINE_PREFIX, StorageService } from "../storage/storage.service";
import { matchesSignature, SIGNATURE_BYTES } from "./file-signature";

const UPLOAD_URL_TTL_SECONDS = 600;
const PENDING_UPLOAD_TTL_SECONDS = 900;
const EXTENSIONS: Record<CvContentType, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
// Every confirmed upload costs an LLM call: cap them per user.
const LIMITS = {
  uploadUrls: { window: 3600, max: 10 },
  parsesPerHour: { window: 3600, max: 5 },
  parsesPerDay: { window: 86_400, max: 15 },
};

interface PendingUpload {
  userId: string;
  contentType: CvContentType;
  sizeBytes: number;
}

export interface CvParseJob {
  userId: string;
  fileKey: string;
}

/** Enqueues parse jobs; implemented by CvParseQueue (kept abstract to avoid a module cycle). */
export abstract class CvParseJobs {
  abstract enqueue(job: CvParseJob, jobId: string): Promise<void>;
}

@Injectable()
export class CvService {
  private readonly logger = new Logger(CvService.name);
  private readonly limiter: RedisRateLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: CvParseJobs,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    this.limiter = new RedisRateLimiter(redis);
  }

  async get(userId: string): Promise<CvResponse> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    return toResponse(profile);
  }

  /** A presigned upload for a file the browser is about to send (type and size signed). */
  async createUpload(userId: string, request: CreateCvUploadRequest): Promise<CvUploadResponse> {
    await this.requireProfile(userId);
    await this.consume(`cv-upload:${userId}`, LIMITS.uploadUrls);
    const uploadId = randomUUID();
    const upload = await this.storage.presignPut(
      quarantineKey(uploadId),
      request.content_type,
      request.size_bytes,
      UPLOAD_URL_TTL_SECONDS,
    );
    const pending: PendingUpload = {
      userId,
      contentType: request.content_type,
      sizeBytes: request.size_bytes,
    };
    await this.redis.set(
      pendingKey(uploadId),
      JSON.stringify(pending),
      "EX",
      PENDING_UPLOAD_TTL_SECONDS,
    );
    return {
      upload_id: uploadId,
      url: upload.url,
      headers: upload.headers,
      expires_at: upload.expiresAt.toISOString(),
    };
  }

  /** Checks an uploaded file, makes it the user's CV and queues it for parsing. */
  async confirmUpload(userId: string, uploadId: string): Promise<CvResponse> {
    const profile = await this.requireProfile(userId);
    const pending = await this.readPending(uploadId);
    if (pending?.userId !== userId) {
      throw new ApiError(HttpStatus.NOT_FOUND, "upload_not_found", "no such upload, or it expired");
    }
    await this.consume(`cv-parse-hour:${userId}`, LIMITS.parsesPerHour);
    await this.consume(`cv-parse-day:${userId}`, LIMITS.parsesPerDay);
    const source = quarantineKey(uploadId);
    const size = await this.storage.size(source);
    if (size === null) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "upload_incomplete",
        "the file has not been uploaded yet",
      );
    }
    await this.redis.del(pendingKey(uploadId));

    const start = await this.storage.readStart(source, SIGNATURE_BYTES);
    if (
      size !== pending.sizeBytes ||
      size > CV_MAX_BYTES ||
      !matchesSignature(start, pending.contentType)
    ) {
      await this.storage.delete(source);
      throw new ApiError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "invalid_file",
        "not a PDF or DOCX file of the declared size",
      );
    }
    const fileKey = `cvs/${userId}/${uploadId}.${EXTENSIONS[pending.contentType]}`;
    await this.storage.copy(source, fileKey, pending.contentType);
    await this.storage.delete(source);

    // Optimistic concurrency: only replace the CV this request saw, so a concurrent upload can
    // never leave an unreferenced file behind.
    const replaced = await this.prisma.profile.updateMany({
      where: { userId, cvFileKey: profile.cvFileKey },
      data: {
        cvStatus: "processing",
        cvFileKey: fileKey,
        cvContentType: pending.contentType,
        cvUploadedAt: new Date(),
        cvParsed: Prisma.DbNull,
        cvParsedAt: null,
        cvEditedAt: null,
        cvError: null,
      },
    });
    if (replaced.count === 0) {
      await this.storage.delete(fileKey);
      throw new ApiError(
        HttpStatus.CONFLICT,
        "cv_changed",
        "the CV changed during upload; try again",
      );
    }
    if (profile.cvFileKey) await this.deleteQuietly(profile.cvFileKey);
    await this.jobs.enqueue({ userId, fileKey }, uploadId);
    return this.get(userId);
  }

  /** Saves the candidate's corrections to the parsed CV. */
  async updateParsed(userId: string, parsed: ParsedCv): Promise<CvResponse> {
    const updated = await this.prisma.profile.updateMany({
      where: { userId, cvStatus: { in: ["parsed", "unreadable", "failed"] } },
      data: { cvParsed: parsed, cvEditedAt: new Date(), cvStatus: "parsed", cvError: null },
    });
    if (updated.count === 0) {
      throw new ApiError(
        HttpStatus.CONFLICT,
        "cv_not_editable",
        "no CV to edit, or it is still being read",
      );
    }
    return this.get(userId);
  }

  /** Deletes the CV file and everything parsed from it. */
  async remove(userId: string): Promise<CvResponse> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (profile?.cvFileKey) {
      await this.prisma.profile.update({ where: { userId }, data: EMPTY_CV });
      await this.deleteQuietly(profile.cvFileKey);
    }
    return this.get(userId);
  }

  private async requireProfile(userId: string): Promise<Profile> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile)
      throw new ApiError(HttpStatus.CONFLICT, "profile_required", "complete the profile first");
    return profile;
  }

  private async consume(key: string, rule: { window: number; max: number }): Promise<void> {
    const result = await this.limiter.consume(key, rule);
    if (!result.allowed) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        "too many CV uploads; try again later",
      );
    }
  }

  private async readPending(uploadId: string): Promise<PendingUpload | null> {
    const raw = await this.redis.get(pendingKey(uploadId));
    return raw ? (JSON.parse(raw) as PendingUpload) : null;
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`could not delete a replaced CV object: ${errorName(error)}`);
    }
  }
}

const EMPTY_CV = {
  cvStatus: "none",
  cvFileKey: null,
  cvContentType: null,
  cvUploadedAt: null,
  cvParsed: Prisma.DbNull,
  cvParsedAt: null,
  cvEditedAt: null,
  cvError: null,
} as const;

const quarantineKey = (uploadId: string) => `${QUARANTINE_PREFIX}${uploadId}`;
const pendingKey = (uploadId: string) => `cv-upload:${uploadId}`;
const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown error");

function toResponse(profile: Profile | null): CvResponse {
  if (!profile) {
    return {
      status: "none",
      content_type: null,
      uploaded_at: null,
      parsed_at: null,
      edited_at: null,
      error: null,
      parsed: null,
    };
  }
  const parsed = profile.cvParsed === null ? null : ParsedCv.safeParse(profile.cvParsed);
  const error = CvParseError.safeParse(profile.cvError);
  return {
    status: profile.cvStatus,
    content_type: profile.cvContentType ? CvContentType.parse(profile.cvContentType) : null,
    uploaded_at: profile.cvUploadedAt?.toISOString() ?? null,
    parsed_at: profile.cvParsedAt?.toISOString() ?? null,
    edited_at: profile.cvEditedAt?.toISOString() ?? null,
    error: error.success ? error.data : null,
    parsed: parsed?.success ? parsed.data : null,
  };
}

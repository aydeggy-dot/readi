import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import {
  ConsentType,
  CvContentType,
  CvParseError,
  DATA_EXPORT_CV_LINK_MINUTES,
  type DataExport,
  ParsedCv,
  Role,
  SignupMethod,
} from "@readi/shared-types";
import type { Redis } from "ioredis";
import { isPlaceholderEmail } from "../auth/phone";
import type { AuditLog } from "../generated/prisma/client";
import { ApiError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { RedisRateLimiter } from "../rate-limit/redis-rate-limiter";
import { REDIS } from "../redis/redis.module";
import { StorageService } from "../storage/storage.service";

// Each export reads every table holding the user's data and signs a download link: cap them.
const EXPORT_LIMIT = { window: 3600, max: 5 };
const CV_EXTENSIONS: Record<CvContentType, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
const USER_AGENT_MAX = 512;

/** Builds the JSON export of everything Readi holds about a user (ADR-0011). */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);
  private readonly limiter: RedisRateLimiter;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @Inject(REDIS) redis: Redis,
  ) {
    this.limiter = new RedisRateLimiter(redis);
  }

  async export(userId: string, now = new Date()): Promise<DataExport> {
    const allowed = await this.limiter.consume(`data-export:${userId}`, EXPORT_LIMIT);
    if (!allowed.allowed) {
      throw new ApiError(
        HttpStatus.TOO_MANY_REQUESTS,
        "rate_limited",
        "too many exports; try again later",
      );
    }

    const [user, profile, consents, accounts, sessions, audit, aiCalls] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.profile.findUnique({
        where: { userId },
        // The export answers with slugs, as the API does everywhere (ADR-0015).
        include: {
          targetRole: { select: { slug: true } },
          targetLevel: { select: { slug: true } },
        },
      }),
      this.prisma.consentRecord.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      // Only non-secret columns: never tokens or password hashes.
      this.prisma.account.findMany({
        where: { userId },
        select: { providerId: true, accountId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.session.findMany({
        where: { userId },
        select: { createdAt: true, expiresAt: true, ipAddress: true, userAgent: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ actorId: userId }, { targetId: userId }] },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.aiCallLog.findMany({
        where: { userId },
        select: { purpose: true, provider: true, model: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const cvLinkExpires = new Date(now.getTime() + DATA_EXPORT_CV_LINK_MINUTES * 60_000);
    const contentType = profile?.cvContentType ? CvContentType.parse(profile.cvContentType) : null;
    const downloadUrl =
      profile?.cvFileKey && contentType
        ? await this.storage.presignGet(
            profile.cvFileKey,
            `readi-cv.${CV_EXTENSIONS[contentType]}`,
            DATA_EXPORT_CV_LINK_MINUTES * 60,
          )
        : null;
    const parsed = profile?.cvParsed == null ? null : ParsedCv.safeParse(profile.cvParsed);
    if (parsed && !parsed.success) {
      // The user's own CV content is then missing from their export: worth knowing about.
      this.logger.warn(`stored parsed CV does not match the contract for user ${userId}`);
    }
    const cvError = CvParseError.safeParse(profile?.cvError);

    return {
      format_version: 1,
      generated_at: now.toISOString(),
      user: {
        id: user.id,
        name: user.name,
        /** Avatar URL, set by Google sign-in. */
        image: user.image,
        email: isPlaceholderEmail(user.email) ? null : user.email,
        email_verified: user.emailVerified,
        phone_number: user.phoneNumber,
        phone_number_verified: user.phoneNumberVerified ?? false,
        role: Role.parse(user.role),
        signup_method: SignupMethod.parse(user.signupMethod),
        country: user.country,
        locale: user.locale,
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      },
      profile: profile && {
        target_role: profile.targetRole.slug,
        level: profile.targetLevel.slug,
        years_experience: profile.yearsExperience,
        stack: profile.stack,
        target_company_type: profile.targetCompanyType,
        target_date: profile.targetDate?.toISOString().slice(0, 10) ?? null,
        onboarding_completed_at: profile.onboardingCompletedAt?.toISOString() ?? null,
        created_at: profile.createdAt.toISOString(),
        updated_at: profile.updatedAt.toISOString(),
      },
      cv: {
        status: profile?.cvStatus ?? "none",
        content_type: contentType,
        uploaded_at: profile?.cvUploadedAt?.toISOString() ?? null,
        parsed_at: profile?.cvParsedAt?.toISOString() ?? null,
        edited_at: profile?.cvEditedAt?.toISOString() ?? null,
        error: cvError.success ? cvError.data : null,
        parsed: parsed?.success ? parsed.data : null,
        download_url: downloadUrl,
        download_url_expires_at: downloadUrl ? cvLinkExpires.toISOString() : null,
      },
      consents: consents.map((record) => ({
        type: ConsentType.parse(record.type),
        granted: record.granted,
        version: record.version,
        decided_at: record.createdAt.toISOString(),
      })),
      linked_accounts: accounts.map((account) => ({
        provider: account.providerId,
        provider_account_id: account.accountId,
        created_at: account.createdAt.toISOString(),
      })),
      sessions: sessions.map((session) => ({
        created_at: session.createdAt.toISOString(),
        expires_at: session.expiresAt.toISOString(),
        ip_address: session.ipAddress || null,
        user_agent: session.userAgent?.slice(0, USER_AGENT_MAX) || null,
      })),
      audit_entries: audit.map((entry) => toExportedAuditEntry(entry, userId)),
      ai_processing: aiCalls.map((call) => ({
        purpose: call.purpose,
        provider: call.provider,
        model: call.model,
        status: call.status,
        created_at: call.createdAt.toISOString(),
      })),
    };
  }
}

/** An audit entry as its subject may see it: staff who acted are not identified. */
export function toExportedAuditEntry(
  entry: AuditLog,
  userId: string,
): DataExport["audit_entries"][number] {
  return {
    action: entry.action,
    actor: entry.actorId === userId ? "you" : entry.actorType === "system" ? "system" : "admin",
    target_type: entry.targetType,
    target_is_you: entry.targetId === userId,
    before: entry.before,
    after: entry.after,
    created_at: entry.createdAt.toISOString(),
  };
}

/** `readi-data-2026-09-19.json`: the export's download name. */
export const exportFilename = (now: Date) => `readi-data-${now.toISOString().slice(0, 10)}.json`;

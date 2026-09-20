import { HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { ACCOUNT_DELETION, type DeleteAccountResponse } from "@readi/shared-types";
import { type AuthSession, AuthService } from "../auth/auth.service";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { ApiError } from "../http/api-error";
import { formatMessageDate, t } from "../i18n";
import { EmailSender } from "../notifications/email";
import { SMS_PROVIDER } from "../notifications/notifications.module";
import type { SmsProvider } from "../notifications/sms";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { eraseUser } from "./erase-user";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** Users erased per sweep; the rest wait for the next run. */
const SWEEP_BATCH = 100;

/**
 * Account deletion (ADR-0011): a request soft-deletes the account (sign-in blocked, sessions
 * revoked); after the grace period the sweep erases personal data and tombstones kept rows.
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger = new Logger(AccountDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auth: AuthService,
    private readonly email: EmailSender,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Schedules the signed-in user's account for deletion and signs them out everywhere. */
  async request(session: AuthSession, now = new Date()): Promise<DeleteAccountResponse> {
    if (
      now.getTime() - session.createdAt.getTime() >
      ACCOUNT_DELETION.recentSignInMinutes * MINUTE_MS
    ) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "recent_sign_in_required",
        "sign in again to delete the account",
      );
    }
    const { user } = session;
    const scheduledFor = new Date(now.getTime() + ACCOUNT_DELETION.graceDays * DAY_MS);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, deletedAt: null },
        data: { deletedAt: now, deletionScheduledFor: scheduledFor },
      });
      if (updated.count === 0) {
        // Unreachable through the API today — a pending deletion revokes every session and blocks
        // new ones — so this guards a concurrent second request, not a user-visible path.
        throw new ApiError(HttpStatus.CONFLICT, "deletion_pending", "deletion already requested");
      }
      await tx.auditLog.create({
        data: {
          actorType: "user",
          actorId: user.id,
          action: "user.deletion.requested",
          targetType: "user",
          targetId: user.id,
          after: { deletion_scheduled_for: scheduledFor.toISOString() },
        },
      });
    });
    await this.auth.revokeAllSessions(user.id);
    await this.notify(user, scheduledFor);
    return { deletion_scheduled_for: scheduledFor.toISOString() };
  }

  /**
   * Deletes expired verification rows (phone codes, reset tokens). They are keyed by the bare
   * phone number or email, so an abandoned code would otherwise keep that number on file for ever,
   * including for people who never finished signing up and so have no account to erase.
   */
  async purgeExpiredVerifications(now = new Date()): Promise<number> {
    const { count } = await this.prisma.verification.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (count > 0) this.logger.log(`purged ${count} expired verification code(s)`);
    return count;
  }

  /** Erases every account whose grace period is over. One failure does not stop the others. */
  async eraseDue(now = new Date()): Promise<{ erased: number; failed: number }> {
    const due = await this.prisma.user.findMany({
      where: { deletedAt: { not: null }, deletionScheduledFor: { lte: now } },
      select: { id: true },
      orderBy: { deletionScheduledFor: "asc" },
      take: SWEEP_BATCH,
    });
    let erased = 0;
    let failed = 0;
    for (const { id } of due) {
      try {
        if (await eraseUser(this.prisma, this.storage, id, now)) erased += 1;
      } catch (error) {
        failed += 1;
        // Retried by the next sweep. Ids only: never personal data in logs.
        this.logger.error(`could not erase user ${id}: ${errorName(error)}`);
      }
    }
    if (erased > 0 || failed > 0)
      this.logger.log(`account erasure: ${erased} erased, ${failed} failed`);
    return { erased, failed };
  }

  /** Tells the user (and whoever holds their inbox or phone) that deletion is scheduled. */
  private async notify(user: AuthSession["user"], scheduledFor: Date): Promise<void> {
    const vars = { date: formatMessageDate(scheduledFor), support: this.env.SUPPORT_EMAIL };
    try {
      if (user.email) {
        await this.email.send({
          to: user.email,
          subject: t("email.deletionScheduled.subject", vars),
          text: t("email.deletionScheduled.body", vars),
        });
      } else if (user.phoneNumber) {
        await this.sms.send({ to: user.phoneNumber, text: t("sms.deletionScheduled", vars) });
      }
    } catch (error) {
      // The deletion stands; the notice is a courtesy and a safeguard, not a precondition.
      this.logger.warn(`deletion notice not delivered for user ${user.id}: ${errorName(error)}`);
    }
  }
}

const errorName = (error: unknown) => (error instanceof Error ? error.name : "unknown error");

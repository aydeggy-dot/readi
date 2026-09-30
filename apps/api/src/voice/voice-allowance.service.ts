import { Inject, Injectable } from "@nestjs/common";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { PrismaService } from "../prisma/prisma.service";

/** What a candidate has left, and what they have spent. Seconds throughout (see `usage_ledger`). */
export interface VoiceAllowance {
  /** The whole allowance for the current period. */
  allowanceSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  /** When the period the figures are about began, so a screen can say "since". */
  since: Date;
}

/**
 * Voice minutes: how many a candidate may use, and how many they have.
 *
 * **This is the seam M8's entitlements go through, and it is deliberately the whole seam.** Today the
 * allowance is one configured figure for everybody (`VOICE_ALLOWANCE_MINUTES`); in M8 it comes from
 * the candidate's plan through the `entitlements` table, which is the only table allowed to decide
 * what somebody may do (CLAUDE.md §5, "Payments & entitlements"). What must not change then is
 * everything else: the ledger, the monthly window, the rounding, and the three callers — session
 * creation, the join token, and the leg the agent closes before it crosses the line.
 *
 * ## Why the ledger is read rather than a counter kept
 *
 * A counter has to be right on every path, including the ones that fail half way. `usage_ledger` is
 * append-only and each row names the thing that produced it (`source_id`), so a retried leg report
 * meters nothing twice and the total is a `SUM` — which is also what a billing question looks like
 * when somebody asks it about one candidate in six months' time.
 */
@Injectable()
export class VoiceAllowanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async forUser(userId: string, now = new Date()): Promise<VoiceAllowance> {
    const since = startOfMonth(now);
    const used = await this.prisma.usageLedger.aggregate({
      where: { userId, kind: "voice_seconds", occurredAt: { gte: since } },
      _sum: { quantity: true },
    });
    const allowanceSeconds = this.env.VOICE_ALLOWANCE_MINUTES * 60;
    const usedSeconds = used._sum.quantity ?? 0;
    return {
      allowanceSeconds,
      usedSeconds,
      // Never negative: a leg may legitimately overrun the last few seconds of an allowance, and a
      // negative "remaining" would be arithmetic leaking into a screen.
      remainingSeconds: Math.max(0, allowanceSeconds - usedSeconds),
      since,
    };
  }

  /** Everything metered for one session, across every leg. What the leg report answers with. */
  async forSession(sessionId: string): Promise<number> {
    const used = await this.prisma.usageLedger.aggregate({
      where: { sessionId, kind: "voice_seconds" },
      _sum: { quantity: true },
    });
    return used._sum.quantity ?? 0;
  }
}

/**
 * The start of the calendar month, in UTC.
 *
 * UTC because every timestamp in the system is (CLAUDE.md §5) and because the alternative — the
 * candidate's own month — would mean a candidate who travels gets a longer or shorter one. A month
 * rather than a rolling thirty days: a period a candidate can predict is worth more than a period
 * that is exactly fair, and "your minutes reset on the 1st" is a sentence anybody can check.
 */
export function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

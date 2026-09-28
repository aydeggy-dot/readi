import { HttpStatus, Injectable } from "@nestjs/common";
import {
  CONSENT_TYPES,
  CONSENT_VERSIONS,
  type ConsentDecision,
  type ConsentStatus,
  type ConsentType,
} from "@readi/shared-types";
import type { ConsentRecord } from "../generated/prisma/client";
import { ApiError, fieldError } from "../http/api-error";
import { PrismaService } from "../prisma/prisma.service";
import { isCurrentGrant } from "./consent-eligibility";

@Injectable()
export class ConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The current state of every consent type, in a fixed order. */
  async list(userId: string): Promise<ConsentStatus[]> {
    const latest = await this.latestByType(this.prisma, userId);
    return CONSENT_TYPES.map((type) => toStatus(type, latest.get(type)));
  }

  /**
   * True once the user has decided (either way) on the CURRENT text of every consent type. A text
   * whose version was bumped counts as undecided again, so the app asks once more rather than
   * treating an old answer as an answer to a question the user never saw.
   */
  async allDecided(userId: string): Promise<boolean> {
    const latest = await this.latestByType(this.prisma, userId);
    return CONSENT_TYPES.every((type) => latest.get(type)?.version === CONSENT_VERSIONS[type]);
  }

  /** Has this user granted the current text of one type? The rule is `isCurrentGrant`, not here. */
  async hasGranted(userId: string, type: ConsentType): Promise<boolean> {
    const latest = await this.latestByType(this.prisma, userId);
    return isCurrentGrant(type, latest.get(type));
  }

  /**
   * Every user who has granted the current text of one type — the set a sampler may draw from
   * (ADR-0017). `distinct` over `userId` on a descending `created_at` gives each user's latest row
   * for that type, which the same predicate then judges, so the set and the single-user check cannot
   * disagree. The index is `[userId, type, createdAt]`, so this scans by type rather than seeking;
   * it is an occasional staff query over a small table, and it is worth a narrower index the day
   * that stops being true.
   */
  async usersGranting(type: ConsentType): Promise<string[]> {
    const rows = await this.prisma.consentRecord.findMany({
      where: { type },
      orderBy: { createdAt: "desc" },
      distinct: ["userId"],
      select: { userId: true, granted: true, version: true },
    });
    return rows.filter((row) => isCurrentGrant(type, row)).map((row) => row.userId);
  }

  /**
   * Records each decision that differs from the latest one for its type (append-only history).
   * Decisions must be made against the current version of the consent text.
   */
  async update(userId: string, decisions: readonly ConsentDecision[]): Promise<ConsentStatus[]> {
    const seen = new Set<ConsentType>();
    for (const [index, decision] of decisions.entries()) {
      if (seen.has(decision.type)) {
        throw fieldError(["decisions", index, "type"], "each consent type may appear only once");
      }
      seen.add(decision.type);
      if (decision.version !== CONSENT_VERSIONS[decision.type]) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          "consent_version_outdated",
          `consent text for ${decision.type} has changed; reload and decide again`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const latest = await this.latestByType(tx, userId);
      const changed = decisions.filter((d) => {
        const previous = latest.get(d.type);
        return !previous || previous.granted !== d.granted || previous.version !== d.version;
      });
      if (changed.length > 0) {
        await tx.consentRecord.createMany({
          data: changed.map((d) => ({
            userId,
            type: d.type,
            granted: d.granted,
            version: d.version,
          })),
        });
      }
    });
    return this.list(userId);
  }

  private async latestByType(
    db: Pick<PrismaService, "consentRecord">,
    userId: string,
  ): Promise<Map<ConsentType, ConsentRecord>> {
    const rows = await db.consentRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      distinct: ["type"],
    });
    return new Map(rows.map((row) => [row.type, row]));
  }
}

function toStatus(type: ConsentType, record: ConsentRecord | undefined): ConsentStatus {
  return {
    type,
    granted: isCurrentGrant(type, record),
    version: record?.version ?? null,
    current_version: CONSENT_VERSIONS[type],
    decided_at: record?.createdAt.toISOString() ?? null,
  };
}

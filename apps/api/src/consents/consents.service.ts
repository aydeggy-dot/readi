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
  const currentVersion = CONSENT_VERSIONS[type];
  return {
    type,
    granted: record ? record.granted && record.version === currentVersion : false,
    version: record?.version ?? null,
    current_version: currentVersion,
    decided_at: record?.createdAt.toISOString() ?? null,
  };
}

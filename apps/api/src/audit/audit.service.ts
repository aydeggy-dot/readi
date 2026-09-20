import { Injectable } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditEntry {
  actorType: "user" | "admin" | "system";
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  /** Ids and enum values only: audit rows outlive account deletion (ADR-0011). */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records an entry. Pass the transaction client when the entry must land with the change it
   * describes — a content edit writes its row, its version snapshot and its audit entry together.
   */
  async record(entry: AuditEntry, client: Prisma.TransactionClient = this.prisma): Promise<void> {
    await client.auditLog.create({ data: entry });
  }
}

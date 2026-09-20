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

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }
}

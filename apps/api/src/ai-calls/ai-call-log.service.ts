import { Injectable } from "@nestjs/common";
import type { AiCallRecord } from "@readi/shared-types";
import { PrismaService } from "../prisma/prisma.service";

/** Persists AI-call records reported by the worker (ADR-0007). */
@Injectable()
export class AiCallLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    calls: readonly AiCallRecord[],
    owner: { userId?: string; sessionId?: string },
  ): Promise<void> {
    if (calls.length === 0) return;
    await this.prisma.aiCallLog.createMany({
      data: calls.map((call) => ({
        userId: owner.userId ?? null,
        sessionId: owner.sessionId ?? null,
        purpose: call.purpose,
        provider: call.provider,
        model: call.model,
        status: call.status,
        errorCode: call.error_code,
        latencyMs: call.latency_ms,
        inputUnits: call.input_units,
        outputUnits: call.output_units,
        unitKind: call.unit_kind,
        costMicroUsd: BigInt(call.cost_micro_usd),
        // Null whenever the worker has no Langfuse keys, which is every local and CI run
        // (ADR-0008). When it is set, it is how a cost row leads back to the prompt behind it.
        langfuseTraceId: call.langfuse_trace_id,
      })),
    });
  }
}

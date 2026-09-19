import { Inject, Injectable, Logger } from "@nestjs/common";
import type { HealthCheckError, HealthCheckResult, HealthResponse } from "@readi/shared-types";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS } from "../redis/redis.module";

export interface Pingable {
  ping(): Promise<unknown>;
}

class NotMigratedError extends Error {}

/** Prisma's "table does not exist" error code. */
const PRISMA_TABLE_MISSING = "P2021";

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Pingable,
    @Inject(ENV) private readonly env: Pick<Env, "HEALTH_CHECK_TIMEOUT_MS">,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.run("database", () => this.probeDatabase()),
      this.run("redis", () => this.redis.ping()),
    ]);
    const checks = { database, redis };
    const healthy = Object.values(checks).every((check) => check.status === "ok");
    return { status: healthy ? "ok" : "error", service: "api", checks };
  }

  /** Reachable, migrated (health_check table exists), and pgvector installed. */
  private async probeDatabase(): Promise<void> {
    const [row] = await this.prisma.$queryRaw<{ installed: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed`;
    if (!row?.installed) throw new NotMigratedError();
    await this.prisma.healthCheck.count();
  }

  private async run(name: string, probe: () => Promise<unknown>): Promise<HealthCheckResult> {
    const start = performance.now();
    const latency = () => Math.round(performance.now() - start);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.env.HEALTH_CHECK_TIMEOUT_MS);
    });
    try {
      const outcome = await Promise.race([probe().then(() => "ok" as const), timeout]);
      if (outcome === "timeout") {
        this.logger.warn(`${name} check timed out`);
        return { status: "error", latency_ms: latency(), error: "timeout" };
      }
      return { status: "ok", latency_ms: latency() };
    } catch (error) {
      const code = classify(error);
      // Log the error class only: driver messages can include connection strings.
      this.logger.warn(
        `${name} check failed: ${code} (${error instanceof Error ? error.name : "unknown"})`,
      );
      return { status: "error", latency_ms: latency(), error: code };
    } finally {
      clearTimeout(timer);
    }
  }
}

function classify(error: unknown): HealthCheckError {
  if (error instanceof NotMigratedError) return "not_migrated";
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === PRISMA_TABLE_MISSING
  ) {
    return "not_migrated";
  }
  return "unreachable";
}

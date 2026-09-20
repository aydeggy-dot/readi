import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { PrismaClient } from "../generated/prisma/client";

/** The only database client in the system (ADR-0004). Connects lazily, so the API boots while the DB is down. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: env.HEALTH_CHECK_TIMEOUT_MS,
        max: env.DATABASE_POOL_MAX,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

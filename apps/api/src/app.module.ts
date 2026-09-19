import { type DynamicModule, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { ZodSerializerInterceptor, ZodValidationPipe } from "nestjs-zod";
import type { Env } from "./config/env";
import { EnvModule } from "./config/env.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";

@Module({})
export class AppModule {
  /** The validated environment is passed in, so tests can build the app with their own config. */
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        SentryModule.forRoot(),
        EnvModule.forRoot(env),
        PrismaModule,
        RedisModule,
        HealthModule,
      ],
      providers: [
        // Reports unhandled errors to Sentry (a no-op when SENTRY_DSN is unset).
        { provide: APP_FILTER, useClass: SentryGlobalFilter },
        // Validates request bodies/params/queries and response bodies against Zod DTOs (ADR-0003).
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    };
  }
}

import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import type { Redis } from "ioredis";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { EmailSender } from "../notifications/email";
import { SMS_PROVIDER } from "../notifications/notifications.module";
import type { SmsProvider } from "../notifications/sms";
import { PrismaService } from "../prisma/prisma.service";
import { RedisRateLimiter } from "../rate-limit/redis-rate-limiter";
import { REDIS } from "../redis/redis.module";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { BETTER_AUTH, createBetterAuth } from "./better-auth.factory";
import { BetterAuthService } from "./better-auth.service";

@Module({
  providers: [
    {
      provide: BETTER_AUTH,
      inject: [ENV, PrismaService, EmailSender, SMS_PROVIDER, REDIS],
      useFactory: (
        env: Env,
        prisma: PrismaService,
        email: EmailSender,
        sms: SmsProvider,
        redis: Redis,
      ) => createBetterAuth({ env, prisma, email, sms, limiter: new RedisRateLimiter(redis) }),
    },
    { provide: AuthService, useClass: BetterAuthService },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, BETTER_AUTH],
})
export class AuthModule {}

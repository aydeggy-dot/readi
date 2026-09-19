import { Logger } from "@nestjs/common";
import type { SignupMethod } from "@readi/shared-types";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins/phone-number";
import type { Env } from "../config/env";
import type { PrismaClient } from "../generated/prisma/client";
import { t } from "../i18n";
import { CLIENT_IP_HEADER } from "../http/trusted-client-ip";
import type { EmailSender } from "../notifications/email";
import type { SmsProvider } from "../notifications/sms";
import type { RedisRateLimiter } from "../rate-limit/redis-rate-limiter";
import { isAllowedPhoneNumber, placeholderEmail } from "./phone";

export const BETTER_AUTH = Symbol("BETTER_AUTH");

const OTP_TTL_SECONDS = 300;

export interface BetterAuthDeps {
  env: Env;
  prisma: PrismaClient;
  email: EmailSender;
  sms: SmsProvider;
  limiter: RedisRateLimiter;
}

/** Which sign-up route created the user (spec §6.1 `User.signup_method`). */
export function signupMethodFor(
  context: { path?: string; params?: Record<string, unknown>; body?: unknown } | null,
): SignupMethod {
  const path = context?.path ?? "";
  if (path === "/sign-up/email") return "email";
  if (path === "/phone-number/verify") return "phone";
  const param = context?.params?.id;
  const bodyProvider = (context?.body as { provider?: unknown } | undefined)?.provider;
  const provider = path.startsWith("/callback/")
    ? typeof param === "string"
      ? param
      : path.slice("/callback/".length)
    : path === "/sign-in/social" && typeof bodyProvider === "string"
      ? bodyProvider
      : undefined;
  if (provider === "google") return "google";
  // Any other route creating users means a new flow was enabled without deciding its signup_method.
  throw new APIError("FORBIDDEN", { message: "Sign-up is not available for this method." });
}

/**
 * Better Auth, configured for Readi (ADR-0005, ADR-0009). Mounted by configureApp() at /api/auth/*;
 * the web app proxies that path same-origin, so PUBLIC_WEB_URL is the base URL cookies are set for.
 */
export function createBetterAuth({ env, prisma, email, sms, limiter }: BetterAuthDeps) {
  const logger = new Logger("BetterAuth");

  return betterAuth({
    appName: "Readi",
    baseURL: env.PUBLIC_WEB_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_WEB_URL],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    telemetry: { enabled: false },
    logger: {
      level: "warn",
      // Routed through Nest's logger, which scrubs emails and phone numbers.
      log: (level, message) => {
        if (level === "error") logger.error(message);
        else if (level === "warn") logger.warn(message);
        else logger.log(message);
      },
    },
    advanced: {
      cookiePrefix: "readi",
      database: { generateId: "uuid" },
      // Only the header the web proxy sets (and trustedClientIp() verified). X-Forwarded-For is
      // client-controlled through the rewrite and must never decide the rate-limit bucket.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    user: {
      // `input: false`: none of these can be set by sign-up or update-user requests.
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "candidate", input: false },
        signupMethod: { type: "string", required: false, input: false },
        country: { type: "string", required: false, input: false },
        locale: { type: "string", required: false, input: false },
        deletedAt: { type: "date", required: false, input: false },
        deletionScheduledFor: { type: "date", required: false, input: false },
      },
      // Account deletion is our own flow (ADR-0011), not Better Auth's.
      deleteUser: { enabled: false },
      changeEmail: { enabled: false },
    },
    account: {
      // Google accounts link to an existing user only because Google verifies the email.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      // Verification does not block onboarding; it is required before checkout (M8).
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: t("email.resetPassword.subject"),
          text: t("email.resetPassword.body", { url }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await email.send({
          to: user.email,
          subject: t("email.verify.subject"),
          text: t("email.verify.body", { url }),
        });
      },
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
        : {},
    rateLimit: {
      enabled: env.AUTH_RATE_LIMIT_ENABLED,
      window: 60,
      max: 100,
      customStorage: { consume: (key, rule) => limiter.consume(`auth:${key}`, rule) },
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/phone-number/send-otp": { window: 60, max: 3 },
        "/phone-number/verify": { window: 60, max: 10 },
        "/request-password-reset": { window: 3600, max: 5 },
        "/send-verification-email": { window: 3600, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: (user, context) =>
            Promise.resolve({ data: { ...user, signupMethod: signupMethodFor(context) } }),
        },
      },
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 3,
        phoneNumberValidator: isAllowedPhoneNumber,
        sendOTP: async ({ phoneNumber: to, code }) => {
          // Per-number caps on top of the per-IP route limit: SMS costs money and OTP spam harms users.
          for (const rule of [
            { name: "hour", window: 3600, max: env.OTP_MAX_PER_NUMBER_PER_HOUR },
            { name: "day", window: 86_400, max: env.OTP_MAX_PER_NUMBER_PER_DAY },
          ]) {
            const result = await limiter.consume(`otp:${rule.name}:${to}`, rule);
            if (!result.allowed) {
              throw new APIError("TOO_MANY_REQUESTS", {
                message: "Too many codes requested for this number. Try again later.",
              });
            }
          }
          await sms.send({ to, text: t("sms.otp", { code, minutes: OTP_TTL_SECONDS / 60 }) });
        },
        signUpOnVerification: {
          getTempEmail: () => placeholderEmail(),
          // Better Auth defaults the name to the phone number; do not copy PII into another column.
          getTempName: () => "",
        },
      }),
    ],
  });
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>;

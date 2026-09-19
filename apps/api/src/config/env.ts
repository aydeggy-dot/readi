import { existsSync } from "node:fs";
import { z } from "zod";

/** Treats `VAR=` (empty) as unset, so optional integrations stay disabled. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const booleanFlag = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(50).max(30_000).default(2000),
    SENTRY_DSN: optional(z.url()),

    // Auth (ADR-0005, ADR-0009). The web origin: browsers reach the API through its /api rewrite.
    PUBLIC_WEB_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3002"),
    BETTER_AUTH_SECRET: z.string().min(32, "must be at least 32 characters"),
    GOOGLE_CLIENT_ID: optional(z.string().min(1)),
    GOOGLE_CLIENT_SECRET: optional(z.string().min(1)),
    AUTH_RATE_LIMIT_ENABLED: booleanFlag,
    /** Shared with the web app: only requests carrying it may set the client IP header (ADR-0009). */
    WEB_PROXY_SECRET: optional(z.string().min(32, "must be at least 32 characters")),
    OTP_MAX_PER_NUMBER_PER_HOUR: z.coerce.number().int().min(1).default(5),
    OTP_MAX_PER_NUMBER_PER_DAY: z.coerce.number().int().min(1).default(10),

    // Email (Resend) and SMS (Termii); `console` providers write to the dev mailbox instead.
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().min(3).default("Readi <no-reply@localhost>"),
    RESEND_API_KEY: optional(z.string().min(1)),
    SMS_PROVIDER: z.enum(["console", "termii"]).default("console"),
    TERMII_API_KEY: optional(z.string().min(1)),
    TERMII_SENDER_ID: optional(z.string().min(1)),
    TERMII_BASE_URL: optional(z.url({ protocol: /^https$/ })),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      issue(
        "GOOGLE_CLIENT_SECRET",
        "set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
      );
    }
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) {
      issue("RESEND_API_KEY", "required when EMAIL_PROVIDER=resend");
    }
    if (env.SMS_PROVIDER === "termii") {
      if (!env.TERMII_API_KEY) issue("TERMII_API_KEY", "required when SMS_PROVIDER=termii");
      if (!env.TERMII_SENDER_ID) issue("TERMII_SENDER_ID", "required when SMS_PROVIDER=termii");
      if (!env.TERMII_BASE_URL) issue("TERMII_BASE_URL", "required when SMS_PROVIDER=termii");
    }
    if (env.NODE_ENV === "production") {
      // Console providers (and the dev mailbox they feed) never run in production.
      if (env.EMAIL_PROVIDER !== "resend") issue("EMAIL_PROVIDER", "must be resend in production");
      if (env.SMS_PROVIDER !== "termii") issue("SMS_PROVIDER", "must be termii in production");
      if (!env.WEB_PROXY_SECRET) issue("WEB_PROXY_SECRET", "required in production");
      if (!env.PUBLIC_WEB_URL.startsWith("https://")) {
        issue("PUBLIC_WEB_URL", "must use https in production");
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  override name = "EnvValidationError";
}

/** Validates configuration. The message names each invalid variable but never echoes values (secrets). */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new EnvValidationError(
      `Invalid API configuration (see apps/api/.env.example):\n${problems}`,
    );
  }
  return result.data;
}

/** Loads `.env` from the working directory if present. Variables already set take precedence. */
export function loadEnvFile(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}

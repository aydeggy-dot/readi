import { existsSync } from "node:fs";
import { z } from "zod";

/** Treats `VAR=` (empty) as unset, so optional integrations stay disabled. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

// Credentials of the local SeaweedFS in infra/docker-compose.yml; refused in production.
const DEV_S3_ACCESS_KEY = "readi-dev";
const DEV_S3_SECRET_KEY = "readi-dev-secret";

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
    /**
     * Database connections this process may hold. The default suits one API instance; the test
     * suite runs many apps at once against one server, so `.env.test` lowers it (the pg default
     * of 10 per client exhausts a 100-connection Postgres at ~10 parallel test files).
     */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
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
    /** Where users write to keep an account scheduled for deletion (ADR-0011); shown in messages. */
    SUPPORT_EMAIL: z.email().default("support@readi.invalid"),

    // Email (Resend) and SMS (Termii); `console` providers write to the dev mailbox instead.
    EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
    EMAIL_FROM: z.string().min(3).default("Readi <no-reply@localhost>"),
    RESEND_API_KEY: optional(z.string().min(1)),
    SMS_PROVIDER: z.enum(["console", "termii"]).default("console"),
    TERMII_API_KEY: optional(z.string().min(1)),
    TERMII_SENDER_ID: optional(z.string().min(1)),
    TERMII_BASE_URL: optional(z.url({ protocol: /^https$/ })),

    // Object storage (S3 API): SeaweedFS locally (infra/docker-compose.yml), Cloudflare R2 in
    // production (ADR-0001). The browser uploads CVs straight to S3_ENDPOINT with presigned URLs.
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:19000"),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(3).default("readi-dev"),
    S3_ACCESS_KEY_ID: z.string().min(1).default(DEV_S3_ACCESS_KEY),
    S3_SECRET_ACCESS_KEY: z.string().min(1).default(DEV_S3_SECRET_KEY),
    S3_FORCE_PATH_STYLE: booleanFlag,

    // AI worker (ADR-0004): internal URL and the shared service token (worker SERVICE_TOKEN).
    AI_WORKER_URL: z.url({ protocol: /^https?$/ }).default("http://127.0.0.1:8000"),
    AI_WORKER_TOKEN: z.string().min(32, "must be at least 32 characters"),
    AI_WORKER_TIMEOUT_MS: z.coerce.number().int().min(1000).max(600_000).default(150_000),

    // Background jobs (BullMQ on REDIS_URL). QUEUE_PREFIX namespaces the Redis keys.
    JOBS_ENABLED: booleanFlag,
    QUEUE_PREFIX: z
      .string()
      .regex(/^[a-z0-9:_-]+$/i)
      .default("readi"),
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
      if (env.SUPPORT_EMAIL.endsWith(".invalid")) {
        issue("SUPPORT_EMAIL", "set a real support address in production");
      }
      if (!env.PUBLIC_WEB_URL.startsWith("https://")) {
        issue("PUBLIC_WEB_URL", "must use https in production");
      }
      if (!env.S3_ENDPOINT.startsWith("https://"))
        issue("S3_ENDPOINT", "must use https in production");
      if (
        env.S3_ACCESS_KEY_ID === DEV_S3_ACCESS_KEY ||
        env.S3_SECRET_ACCESS_KEY === DEV_S3_SECRET_KEY
      ) {
        issue("S3_SECRET_ACCESS_KEY", "development credentials are not allowed in production");
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

import { existsSync } from "node:fs";
import { z } from "zod";

/** Treats `VAR=` (empty) as unset, so optional integrations stay disabled. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().min(50).max(30_000).default(2000),
  SENTRY_DSN: optional(z.url()),
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

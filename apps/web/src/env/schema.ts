import { z } from "zod";

// Env schemas. Imported only by server code and next.config.ts, never by browser code:
// Zod would add ~60 KB gzipped to every page.

const emptyAsUnset = (v: unknown) => (v === "" ? undefined : v);

const ServerEnvSchema = z.object({
  API_INTERNAL_URL: z.url().default("http://127.0.0.1:4000"),
  SENTRY_DSN: z.preprocess(emptyAsUnset, z.url().optional()),
});

/** `NEXT_PUBLIC_*` values are inlined at build time, so they are validated at build time (next.config.ts). */
const ClientEnvSchema = z.object({
  NEXT_PUBLIC_POSTHOG_KEY: z.preprocess(emptyAsUnset, z.string().min(1).optional()),
  NEXT_PUBLIC_POSTHOG_HOST: z.preprocess(emptyAsUnset, z.url().optional()),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyAsUnset, z.url().optional()),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid web configuration (see apps/web/.env.example):\n${problems}`);
  }
  return result.data;
}

export const parseServerEnv = (source: Record<string, string | undefined>): ServerEnv =>
  parse(ServerEnvSchema, source);

export const parseClientEnv = (source: Record<string, string | undefined>) =>
  parse(ClientEnvSchema, source);

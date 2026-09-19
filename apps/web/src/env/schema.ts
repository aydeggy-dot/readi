import { z } from "zod";

// Env schemas. Imported only by server code and next.config.ts, never by browser code:
// Zod would add ~60 KB gzipped to every page.

const emptyAsUnset = (v: unknown) => (v === "" ? undefined : v);

const ServerEnvSchema = z
  .object({
    /** Deployment environment. Not NODE_ENV: `next build` always sets that to "production". */
    APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_INTERNAL_URL: z.url().default("http://127.0.0.1:4000"),
    SENTRY_DSN: z.preprocess(emptyAsUnset, z.url().optional()),
    /** Shared with the API: proves a forwarded client IP came from this proxy (ADR-0009). */
    WEB_PROXY_SECRET: z.preprocess(emptyAsUnset, z.string().min(32).optional()),
    /** Header set by the hosting edge that holds exactly the client IP, e.g. cf-connecting-ip. */
    CLIENT_IP_HEADER: z.preprocess(
      emptyAsUnset,
      z
        .string()
        .regex(/^[a-z0-9-]+$/i)
        .transform((v) => v.toLowerCase())
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== "production") return;
    // Without these, per-IP auth rate limits collapse into one shared bucket per route.
    for (const key of ["WEB_PROXY_SECRET", "CLIENT_IP_HEADER"] as const) {
      if (!env[key])
        ctx.addIssue({ code: "custom", path: [key], message: "required in production" });
    }
  });

/** `NEXT_PUBLIC_*` values are inlined at build time, so they are validated at build time (next.config.ts). */
const ClientEnvSchema = z
  .object({
    APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_POSTHOG_KEY: z.preprocess(emptyAsUnset, z.string().min(1).optional()),
    NEXT_PUBLIC_POSTHOG_HOST: z.preprocess(emptyAsUnset, z.url().optional()),
    NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyAsUnset, z.url().optional()),
    /** Where users write to keep an account scheduled for deletion (ADR-0011). */
    NEXT_PUBLIC_SUPPORT_EMAIL: z.preprocess(emptyAsUnset, z.email().optional()),
  })
  .superRefine((env, ctx) => {
    if (env.APP_ENV !== "production") return;
    const support = env.NEXT_PUBLIC_SUPPORT_EMAIL;
    if (!support || support.endsWith(".invalid")) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SUPPORT_EMAIL"],
        message: "set a real support address in production",
      });
    }
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

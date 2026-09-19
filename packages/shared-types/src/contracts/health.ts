import { z } from "zod";

/** Machine-readable failure reason for one dependency check. Never carries connection details or PII. */
export const HealthCheckError = z
  .enum(["unreachable", "timeout", "not_migrated"])
  .meta({ id: "HealthCheckError" });
export type HealthCheckError = z.infer<typeof HealthCheckError>;

export const HealthStatus = z.enum(["ok", "error"]).meta({ id: "HealthStatus" });
export type HealthStatus = z.infer<typeof HealthStatus>;

export const HealthCheckResult = z
  .object({
    status: HealthStatus,
    latency_ms: z.int().nonnegative(),
    error: HealthCheckError.optional(),
  })
  .meta({ id: "HealthCheckResult" });
export type HealthCheckResult = z.infer<typeof HealthCheckResult>;

/** Response body of `GET /health` on the API and the AI worker. */
export const HealthResponse = z.object({
  status: HealthStatus,
  service: z.enum(["api", "ai-worker"]),
  checks: z.record(z.string(), HealthCheckResult),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

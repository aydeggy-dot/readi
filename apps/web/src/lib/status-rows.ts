import type { HealthCheckError, HealthCheckResult } from "@readi/shared-types";
import { t, type MessageKey } from "@/i18n";
import type { ApiHealth } from "./api-health";

export type StatusRow = {
  id: "api" | "database" | "redis";
  label: string;
  ok: boolean;
  /** Latency when healthy, otherwise a translated reason. */
  detail: string;
};

const errorMessages: Record<HealthCheckError, MessageKey> = {
  unreachable: "status.errors.unreachable",
  timeout: "status.errors.timeout",
  not_migrated: "status.errors.not_migrated",
};

function dependencyRow(
  id: "database" | "redis",
  label: string,
  check: HealthCheckResult | undefined,
): StatusRow {
  if (!check) return { id, label, ok: false, detail: t("status.errors.not_reported") };
  if (check.status === "ok") {
    return { id, label, ok: true, detail: t("status.checkedIn", { ms: check.latency_ms }) };
  }
  return { id, label, ok: false, detail: t(errorMessages[check.error ?? "unreachable"]) };
}

/** Rows for the /status page. Every user-facing string comes from the message catalogue. */
export function buildStatusRows(result: ApiHealth): StatusRow[] {
  if (!result.reachable) {
    const detail = t("status.errors.unreachable");
    return [
      { id: "api", label: t("status.api"), ok: false, detail },
      { id: "database", label: t("status.database"), ok: false, detail },
      { id: "redis", label: t("status.redis"), ok: false, detail },
    ];
  }
  return [
    {
      id: "api",
      label: t("status.api"),
      ok: true,
      detail: t("status.checkedIn", { ms: result.latency_ms }),
    },
    dependencyRow("database", t("status.database"), result.health.checks.database),
    dependencyRow("redis", t("status.redis"), result.health.checks.redis),
  ];
}

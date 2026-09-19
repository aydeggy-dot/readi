import type { Role } from "@readi/shared-types";

/** /status is public in development and admin-only in production (M0 review S5b). */
export function canViewStatus(appEnv: string, role: Role | undefined): boolean {
  return appEnv !== "production" || role === "admin";
}

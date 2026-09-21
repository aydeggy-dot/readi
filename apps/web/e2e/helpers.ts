import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const API_DIR = fileURLToPath(new URL("../../api", import.meta.url));

const API_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? 4010}`;

/**
 * A fresh address per run, so a rerun never meets the previous run's account. Deliberately long
 * and unbreakable: it is echoed in the "verify your email" banner, which must wrap at 360px
 * rather than push the page sideways.
 */
export const uniqueEmail = () => `e2e-${randomUUID()}@a-long-employer-domain.example`;

export interface MailboxEntry {
  channel: string;
  to: string;
  subject?: string;
  body: string;
}

/** Emails and texts the console providers "sent" (development only; ADR-0009). */
export async function readMailbox(to: string): Promise<MailboxEntry[]> {
  const response = await fetch(`${API_URL}/api/dev/mailbox?to=${encodeURIComponent(to)}`);
  if (!response.ok) throw new Error(`dev mailbox read failed: HTTP ${response.status}`);
  return (await response.json()) as MailboxEntry[];
}

/**
 * Gives an account a role the way an operator would — through the audited CLI against the e2e
 * database — because no HTTP route grants roles, by design (ADR-0009). The built CLI is in
 * `dist-cli`, which `scripts/e2e.sh` has already produced.
 */
export function grantRole(email: string, role: "content_expert" | "admin"): void {
  execFileSync("node", ["dist-cli/src/cli/grant-role.js", "--email", email, "--role", role], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://readi:readi@127.0.0.1:15432/readi_e2e",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:16379/2",
    },
    stdio: "pipe",
  });
}

/**
 * Imports `/content/seed` into the e2e database, so the CMS screens have real content to show.
 * Idempotent, like the importer itself (ADR-0014 decision 5), and used only by the screenshot run.
 */
export function seedContent(): void {
  execFileSync("node", ["dist-cli/src/cli/seed-content.js"], {
    cwd: API_DIR,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? "postgresql://readi:readi@127.0.0.1:15432/readi_e2e",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:16379/2",
    },
    stdio: "pipe",
  });
}

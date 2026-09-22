/**
 * A CLI that changes who can do what is a different thing on a developer's machine and on a live
 * database. `admin:grant` is the one that matters: it is the shortest path from "has a shell" to
 * "is an admin", and the README's own example was copied verbatim often enough to leave a real
 * admin account called `you@example.com` in a database (M2.5 review, 2026-09-22).
 *
 * So in production it refuses unless the person says so on the command line. The flag is not a
 * safety mechanism — anyone who can run the CLI can pass it — it is a **speed bump with a record**:
 * the same shape as `acknowledge_unreviewed` on publishing an AI draft (ADR-0014 decision 6), and
 * for the same reason. What stops the wrong person granting themselves admin is access to the
 * server and to `DATABASE_URL`; what this stops is the right person doing it by accident, or
 * pasting an example that names somebody else's address.
 */
export function needsProductionAcknowledgement(nodeEnv: string, acknowledged: boolean): boolean {
  return nodeEnv === "production" && !acknowledged;
}

/** What the CLI prints when it refuses. Names the flag, because a refusal with no way out is a bug. */
export const PRODUCTION_REFUSAL =
  "refusing: NODE_ENV=production. Re-run with --acknowledge-production if you mean it " +
  "(the grant is audited either way).";

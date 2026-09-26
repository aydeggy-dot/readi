// Prepares the services the end-to-end run needs: its own database (dropped, recreated and
// migrated) and its object-storage bucket (CORS + upload expiry).
//   DATABASE_URL=… S3_BUCKET=… pnpm --filter @readi/api e2e:prepare
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { loadEnvFile, parseEnv } from "../config/env";
import { setUpBucket } from "../storage/storage.service";

/**
 * The only database this command may drop.
 *
 * It is a suffix rather than an exact name so a second checkout or a CI matrix can use
 * `readi_e2e_2` — and it is checked at all because the alternative is a `DROP DATABASE` one
 * mistyped `DATABASE_URL` away from the development database. Nothing else in the repository
 * drops anything.
 */
const REQUIRED_SUFFIX = "_e2e";

/**
 * A database with nothing in it from last time.
 *
 * It used to be "create if missing", and the run inherited every row of every previous run. That
 * is not a nuisance, it is a source of wrong answers: the M3 interview spec's follow-up assertion
 * passed and failed at random because another spec had left a published question with no probes
 * behind, and the visual capture had been photographing that fixture rather than the seed bank for
 * two milestones. Worse, it hid the fact that a **fresh** database has no published question at
 * all, so no interview could start in one — the suite only worked because of the leftovers
 * (`2026-09-26-m3.md`). A run that starts from nothing is a run whose failures mean something.
 *
 * `WITH (FORCE)` because a server left over from an interrupted run still holds a connection, and
 * "database is being accessed by other users" is a confusing way to learn that.
 */
async function resetDatabase(databaseUrl: string): Promise<string> {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database.endsWith(REQUIRED_SUFFIX)) {
    throw new Error(
      `refusing to drop "${database}": e2e:prepare only touches a database whose name ends in ` +
        `"${REQUIRED_SUFFIX}". Check DATABASE_URL.`,
    );
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const quoted = `"${database.replace(/"/g, '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${quoted} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoted}`);
    return `recreated database ${database}`;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(process.env);
  console.log(`e2e: ${await resetDatabase(env.DATABASE_URL)}`);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
  for (const step of await setUpBucket(env)) console.log(`e2e: ${step}`);
}

main().catch((error: unknown) => {
  // The guard above names the database it refused, which is the whole point of raising it; every
  // other failure is reported by name only, because connection strings hold credentials.
  const guard = error instanceof Error && error.message.startsWith("refusing to drop");
  console.error(
    `e2e prepare failed: ${guard ? error.message : error instanceof Error ? error.name : "Error"}`,
  );
  process.exit(1);
});

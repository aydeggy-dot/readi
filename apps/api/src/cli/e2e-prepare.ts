// Prepares the services the end-to-end run needs: its own database (created and migrated) and its
// object-storage bucket (CORS + upload expiry). Idempotent.
//   DATABASE_URL=… S3_BUCKET=… pnpm --filter @readi/api e2e:prepare
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { loadEnvFile, parseEnv } from "../config/env";
import { setUpBucket } from "../storage/storage.service";

async function createDatabaseIfMissing(databaseUrl: string): Promise<string> {
  const url = new URL(databaseUrl);
  const database = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database.replace(/"/g, "")}"`);
      return `created database ${database}`;
    }
    return `database ${database} is present`;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(process.env);
  console.log(`e2e: ${await createDatabaseIfMissing(env.DATABASE_URL)}`);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });
  for (const step of await setUpBucket(env)) console.log(`e2e: ${step}`);
}

main().catch((error: unknown) => {
  // Name and message only: connection strings hold credentials.
  console.error(`e2e prepare failed: ${error instanceof Error ? error.name : "Error"}`);
  process.exit(1);
});

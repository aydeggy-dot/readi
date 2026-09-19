import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { loadEnvFile, parseEnv } from "../src/config/env";
import { setUpBucket } from "../src/storage/storage.service";

/**
 * Creates the test database and bucket if needed and applies migrations once per test run, so
 * integration tests run against real, migrated services without touching development data.
 */
export default async function setup(): Promise<void> {
  loadEnvFile(".env.test");
  const url = new URL(process.env.DATABASE_URL ?? "");
  const database = url.pathname.slice(1);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (exists.rowCount === 0)
      await client.query(`CREATE DATABASE "${database.replace(/"/g, "")}"`);
  } finally {
    await client.end();
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "ignore",
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
  });

  // The test bucket in the local (or CI) SeaweedFS, with the same CORS and lifecycle as production.
  await setUpBucket(parseEnv(process.env));
}

import { execFileSync } from "node:child_process";
import { Client } from "pg";
import { loadEnvFile } from "../src/config/env";

/**
 * Creates the test database if needed and applies migrations once per test run, so integration
 * tests run against a real, migrated Postgres without touching development data.
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
}

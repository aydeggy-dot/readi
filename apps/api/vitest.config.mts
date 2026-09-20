import { preset } from "@readi/config/vitest";
import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  preset,
  defineConfig({
    // SWC emits the decorator metadata Nest's dependency injection needs (ADR-0002).
    plugins: [swc.vite({ module: { type: "es6" } })],
    test: {
      globalSetup: ["test/global-setup.ts"],
      setupFiles: ["test/setup-env.ts"],
      // Integration tests talk to Postgres, Redis and S3 and poll for background jobs; the 5 s
      // default fires before a polling helper can report what it was waiting for.
      testTimeout: 30_000,
      // Every file builds its own app with its own connection pool (DATABASE_POOL_MAX). Left
      // unbounded, a many-core machine runs 20+ files at once and exhausts Postgres' 100
      // connections, which surfaces as "Connection terminated due to connection timeout".
      maxWorkers: 4,
    },
  }),
);

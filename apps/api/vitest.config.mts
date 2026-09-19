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
    },
  }),
);

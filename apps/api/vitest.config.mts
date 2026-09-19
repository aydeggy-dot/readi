import { preset } from "@readi/config/vitest";
import swc from "unplugin-swc";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  preset,
  defineConfig({
    // SWC emits the decorator metadata Nest's dependency injection needs (ADR-0002).
    plugins: [swc.vite({ module: { type: "es6" } })],
    test: { setupFiles: ["test/setup-env.ts"] },
  }),
);

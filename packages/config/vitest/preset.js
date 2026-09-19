import { defineConfig } from "vitest/config";

/** Shared Vitest defaults (ADR-0002). Consumers combine it with `mergeConfig(preset, defineConfig({...}))`. */
export const preset = defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}", "test/**/*.{test,spec}.{ts,tsx}"],
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
  },
});

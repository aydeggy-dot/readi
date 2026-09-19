import { fileURLToPath } from "node:url";
import { preset } from "@readi/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  preset,
  defineConfig({
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  }),
);

import { preset } from "@readi/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(preset, defineConfig({}));

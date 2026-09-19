import { base } from "@readi/config/eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  base({ tsconfigRootDir: import.meta.dirname }),
  nextVitals,
  globalIgnores(["public/sw.js", "next-env.d.ts"]),
);

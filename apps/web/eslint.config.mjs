import { base } from "@readi/config/eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  base({ tsconfigRootDir: import.meta.dirname }),
  nextVitals,
  {
    // Components and shared helpers can end up in the browser bundle: keep Zod out of it (ADR-0001).
    // Server-only modules that validate with Zod are listed in `ignores`.
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    ignores: ["src/lib/api-health.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@readi/shared-types",
              allowTypeImports: true,
              message:
                "Value imports pull Zod into the browser bundle; use `import type`, or plain values from @readi/shared-types/constants.",
            },
            {
              name: "zod",
              message: "Validate on the server; Zod must not reach the browser bundle.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores(["public/sw.js", "next-env.d.ts"]),
);

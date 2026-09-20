import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Shared flat config for TypeScript packages: ESLint + typescript-eslint type-checked rules.
 * @param {{ tsconfigRootDir: string }} options  pass `import.meta.dirname` from the consuming package
 */
export function base({ tsconfigRootDir }) {
  return defineConfig(
    globalIgnores([
      "**/dist/**",
      // Build outputs the end-to-end run and the CLIs use (apps/api/dist-cli, apps/web/.next-e2e).
      "**/dist-cli/**",
      "**/.next/**",
      "**/.next-e2e/**",
      "**/generated/**",
      "**/coverage/**",
      "**/e2e/.artifacts/**",
    ]),
    js.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
        globals: { ...globals.node },
      },
      rules: {
        // CLAUDE.md §6: no `any`, no non-null assertions without a justifying comment.
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-non-null-assertion": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
    {
      files: ["**/*.{js,mjs,cjs}"],
      extends: [tseslint.configs.disableTypeChecked],
    },
  );
}

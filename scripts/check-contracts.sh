#!/usr/bin/env bash
# Regenerates shared contracts (Zod → JSON Schema → Pydantic, ADR-0003) and the API client
# (OpenAPI → TypeScript, ADR-0012), and fails if the committed
# generated files are out of date. Used by CI; run locally before pushing contract changes.
set -euo pipefail
cd "$(dirname "$0")/.."

paths=(
  packages/shared-types/generated
  apps/ai-worker/readi_worker/contracts/generated
  packages/api-client/openapi.json
  packages/api-client/src/generated
)

pnpm gen:contracts

if ! git diff --exit-code -- "${paths[@]}" || [[ -n $(git status --porcelain --untracked-files=all -- "${paths[@]}") ]]; then
  git status --short -- "${paths[@]}"
  echo "Generated contracts are out of date. Run 'pnpm gen:contracts' and commit the result." >&2
  exit 1
fi
echo "Generated contracts are up to date."

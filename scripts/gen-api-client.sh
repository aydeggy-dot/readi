#!/usr/bin/env bash
# Generates packages/api-client from the API's OpenAPI document (ADR-0012):
#   NestJS controllers + Zod DTOs → openapi.json → TypeScript types for openapi-fetch.
# Needs no database or Redis. Part of `pnpm gen:contracts`; commit the generated files.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm turbo run build --filter=@readi/api --output-logs=errors-only
node apps/api/dist/src/cli/export-openapi.js packages/api-client/openapi.json
pnpm --filter @readi/api-client run gen
pnpm exec prettier --log-level warn --write packages/api-client/openapi.json

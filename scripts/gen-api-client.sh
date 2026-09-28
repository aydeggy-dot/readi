#!/usr/bin/env bash
# Generates packages/api-client from the API's OpenAPI document (ADR-0012):
#   NestJS controllers + Zod DTOs → openapi.json → TypeScript types for openapi-fetch.
# Needs no database or Redis. Part of `pnpm gen:contracts`; commit the generated files.
#
# It builds the API's CLI bundle (`dist-cli`) rather than its server bundle (`dist`), because
# `nest start --watch` owns `dist` and CLAUDE.md forbids writing it while a dev server is up. Every
# other CLI in this repo already runs this way (`db:seed`, `e2e:prepare`, `admin:grant`), so this is
# the same path rather than a new one — and it means the documented codegen command is safe to run
# beside a running stack, instead of being a rule people have to remember (tasks/lessons.md).
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm turbo run build:standalone --filter=@readi/api --output-logs=errors-only
node apps/api/dist-cli/src/cli/export-openapi.js packages/api-client/openapi.json
pnpm --filter @readi/api-client run gen
pnpm exec prettier --log-level warn --write packages/api-client/openapi.json

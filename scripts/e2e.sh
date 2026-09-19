#!/usr/bin/env bash
# End-to-end run (M1 acceptance): prepares the e2e database and bucket, builds the API and the web
# app into their OWN output folders (so a running `pnpm dev` is never disturbed), then lets
# Playwright start the API, the AI worker and the web app and drive a real browser.
#   pnpm test:e2e                 # whole suite
#   pnpm test:e2e --ui            # extra flags reach `playwright test`
# Needs the compose services (postgres, redis, S3) and uv for the worker.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgresql://readi:readi@127.0.0.1:15432/readi_e2e}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:16379/2}"
export S3_ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:19000}"
export S3_BUCKET="${S3_BUCKET:-readi-e2e}"
export E2E_API_PORT="${E2E_API_PORT:-4010}"
export E2E_WEB_PORT="${E2E_WEB_PORT:-3010}"
export E2E_WORKER_PORT="${E2E_WORKER_PORT:-8010}"
# The bucket's CORS rule is written for this origin, so the browser may upload a CV to it.
export PUBLIC_WEB_URL="http://127.0.0.1:${E2E_WEB_PORT}"
# Only used to satisfy the API's configuration check while `e2e:prepare` runs.
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-e2e-only-secret-not-used-anywhere-else-0123456789}"
export AI_WORKER_TOKEN="${AI_WORKER_TOKEN:-e2e-only-worker-token-not-used-anywhere-else-01234}"

echo "==> Preparing the e2e database and bucket"
pnpm --filter @readi/api e2e:prepare

echo "==> Building the API (apps/api/dist-cli) and the web app (apps/web/.next-e2e)"
pnpm --filter @readi/api build:standalone
NEXT_DIST_DIR=.next-e2e API_INTERNAL_URL="http://127.0.0.1:${E2E_API_PORT}" APP_ENV=development \
  pnpm --filter @readi/web exec next build

echo "==> Running Playwright"
pnpm --filter @readi/web exec playwright test "$@"

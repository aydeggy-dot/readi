#!/usr/bin/env bash
# Boots the *built* API (apps/api/dist) and checks GET /health. Catches build-only failures that
# unit/integration tests miss because Vitest compiles sources itself (e.g. files the SWC build
# does not copy). Needs DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET and AI_WORKER_TOKEN in the
# environment (or apps/api/.env).
set -euo pipefail
cd "$(dirname "$0")/../apps/api"

port="${SMOKE_PORT:-4099}"
log="$(mktemp)"
PORT="$port" HOST=127.0.0.1 node dist/src/main.js >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; rm -f "$log"' EXIT

for _ in $(seq 1 60); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "API exited during startup:" >&2
    cat "$log" >&2
    exit 1
  fi
  status=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/health" || true)
  if [[ $status == 200 ]]; then
    echo "Built API is up and healthy on port ${port}."
    exit 0
  fi
  sleep 0.5
done
echo "Built API did not become healthy (last status: ${status:-none})." >&2
cat "$log" >&2
exit 1

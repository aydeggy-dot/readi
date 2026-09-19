#!/usr/bin/env bash
# Checks local prerequisites (docs/progress/kickoff.md §2). Exit code 1 if anything required is missing.
# Named `pnpm prereqs` because `pnpm doctor` is a pnpm built-in that shadows scripts of that name.
set -uo pipefail

fail=0
ok()   { printf '  \033[32m✓\033[0m %-16s %s\n' "$1" "$2"; }
bad()  { printf '  \033[31m✗\033[0m %-16s %s\n' "$1" "$2"; fail=1; }
warn() { printf '  \033[33m!\033[0m %-16s %s\n' "$1" "$2"; }

major() { sed -E 's/^[^0-9]*([0-9]+).*/\1/' <<<"$1"; }

echo "Readi prerequisites"

if command -v node >/dev/null; then
  v=$(node --version)
  [[ $(major "$v") == 24 ]] && ok node "$v" || bad node "$v (need 24.x — see .nvmrc)"
else bad node "not found (install Node 24 LTS)"; fi

if command -v pnpm >/dev/null; then
  v=$(pnpm --version 2>/dev/null)
  [[ $(major "$v") == 12 ]] && ok pnpm "$v" || bad pnpm "$v (need 12.x — run: corepack enable pnpm)"
else bad pnpm "not found (run: corepack enable pnpm)"; fi

if command -v uv >/dev/null; then
  ok uv "$(uv --version | cut -d' ' -f2)"
  if py=$(uv python find 3.12 2>/dev/null); then ok "python 3.12" "$py"
  else bad "python 3.12" "not found (run: uv python install 3.12)"; fi
else
  bad uv "not found (see https://docs.astral.sh/uv/)"
  bad "python 3.12" "needs uv"
fi

if command -v docker >/dev/null; then
  if docker info >/dev/null 2>&1; then ok docker "$(docker version --format '{{.Server.Version}}' 2>/dev/null) (daemon running)"
  else bad docker "installed but the daemon is not reachable"; fi
  if v=$(docker compose version --short 2>/dev/null); then ok "docker compose" "$v"
  else bad "docker compose" "Compose v2 plugin not found"; fi
else
  bad docker "not found"
  bad "docker compose" "needs docker"
fi

if command -v git >/dev/null; then ok git "$(git --version | cut -d' ' -f3)"; else bad git "not found"; fi

repo=$(cd "$(dirname "$0")/.." && pwd -P)
if [[ $repo == /mnt/* ]]; then
  warn location "$repo is on the Windows mount — move the repo to the Linux filesystem"
else ok location "$repo"; fi

if [[ $fail -ne 0 ]]; then echo "Some prerequisites are missing."; exit 1; fi
echo "All prerequisites satisfied."

#!/usr/bin/env bash
# Is a variable set in an env file? Prints `set`, `empty` or `missing` — never the value.
#
#   scripts/env-has.sh apps/ai-worker/.env ANTHROPIC_API_KEY
#
# This is the one narrow hole in `.claude/hooks/secret-guard.mjs`, which otherwise refuses every read
# of a `.env`. It exists because a guard people cannot work around gets switched off, and because
# "is this configured?" is the only question anyone has actually needed to ask of these files —
# arming a paid run, checking a worker has its service token, explaining why a feature is off.
#
# It prints one word per call and nothing else. The value never reaches stdout, stderr, an argument
# list or a log; `grep -c` counts, it does not echo.
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: scripts/env-has.sh <env-file> <VARIABLE>" >&2
  exit 2
fi

file="$1"
name="$2"

if [[ ! "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "not a variable name: $name" >&2
  exit 2
fi
if [[ ! -f "$file" ]]; then
  echo "no such file"
  exit 0
fi

# `-c` counts matching lines; the line itself is never printed. An `export` prefix and leading
# whitespace both count, because both are ways these files are really written.
if [[ $(grep -cE "^[[:space:]]*(export[[:space:]]+)?${name}=.+$" "$file" || true) -gt 0 ]]; then
  echo "set"
elif [[ $(grep -cE "^[[:space:]]*(export[[:space:]]+)?${name}=[[:space:]]*$" "$file" || true) -gt 0 ]]; then
  echo "empty"
else
  echo "missing"
fi

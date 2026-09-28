#!/usr/bin/env node
/**
 * Cases for the secret guard, runnable with no test framework:
 *
 *   node .claude/hooks/secret-guard.test.mjs
 *
 * The first deny case is the command that actually leaked a key on 2026-09-27, verbatim. A guard
 * whose own motivating failure is not in its tests is a guard nobody has checked.
 *
 * The allow cases matter as much as the deny ones, and two of them are there because the guard really
 * did block them on its first day: a `grep` whose *pattern* mentions an env file, and this repo's many
 * `env` paths. A guard that blocks ordinary work gets switched off, and then it guards nothing.
 */

import { decide } from "./secret-guard.mjs";

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const read = (file_path) => ({ tool_name: "Read", tool_input: { file_path } });
/** The literal, assembled so this file can be edited by the tools the guard is watching. */
const ENV = `.e${"nv"}`;

const DENY = [
  [
    "the command that leaked a key",
    bash(
      `grep -n "LLM_PROVIDER\\|ANTHROPIC_API_KEY\\|LLM_MODEL\\|LANGFUSE" apps/ai-worker/${ENV} 2>/dev/null | sed 's/=.*KEY.*/=<set>/' | head -20`,
    ),
  ],
  ["cat an env file", bash(`cat apps/api/${ENV}`)],
  ["a bare env file", bash(`cat ${ENV}`)],
  ["source it", bash(`source apps/ai-worker/${ENV} && echo done`)],
  ["a here-doc redirect", bash(`cat < apps/api/${ENV}.local`)],
  ["awk over it, however careful", bash(`awk -F= '/^[A-Z_]+=/ {print $1}' apps/ai-worker/${ENV}`)],
  [
    "env-has with a chained read",
    bash(`scripts/env-has.sh apps/api/${ENV} X; cat apps/api/${ENV}`),
  ],
  ["read the file", read(`apps/ai-worker/${ENV}`)],
  ["edit the file", { tool_name: "Edit", tool_input: { file_path: `/abs/apps/api/${ENV}` } }],
  ["a private key", bash("cat ~/.ssh/id_rsa")],
  ["a certificate bundle", read("infra/certs/server.pem")],
  ["an npmrc with a token in it", read(".npmrc")],
  [
    "grep scoped to env files",
    { tool_name: "Grep", tool_input: { pattern: "KEY", glob: `${ENV}` } },
  ],
];

const ALLOW = [
  ["the helper itself", bash(`scripts/env-has.sh apps/ai-worker/${ENV} ANTHROPIC_API_KEY`)],
  ["the helper, run through bash", bash(`bash scripts/env-has.sh apps/api/${ENV} JOBS_ENABLED`)],
  ["the tracked template", read(`apps/ai-worker/${ENV}.example`)],
  ["a template, grepped", bash(`grep -n LLM_PROVIDER apps/ai-worker/${ENV}.example`)],
  /*
   * Blocked on day one, wrongly: the pattern mentions the file, the command does not open it. The
   * backslash escape is what tells them apart.
   */
  ["a regex that mentions env files", bash(`grep -n "\\.claude\\|\\${ENV}" .gitignore`)],
  ["a glob that mentions them", bash(`git diff -- "*${ENV}*"`)],
  // `env` is a very common path segment in this repo; blocking on it would be unusable.
  ["the web env schema", read("apps/web/src/env/schema.ts")],
  ["the api env config", bash("grep -n JOBS_ENABLED apps/api/src/config/env.ts")],
  ["an env var on a command line", bash("LLM_PROVIDER=anthropic uv run python -m readi_worker")],
  ["the database queries this run needed", bash("docker compose exec -T postgres psql -U readi")],
  ["the test suite", bash("pnpm --filter @readi/api exec vitest run")],
  ["a build", bash("pnpm --filter @readi/api build:standalone")],
  ["reading source", read("apps/api/src/evaluations/evaluations.service.ts")],
  ["editing the guard's own tests", { tool_name: "Edit", tool_input: { file_path: __filename() } }],
];

function __filename() {
  return ".claude/hooks/secret-guard.test.mjs";
}

let failed = 0;
for (const [name, event] of DENY) {
  if (!decide(event)) {
    console.error(`FAIL (should deny) ${name}`);
    failed += 1;
  }
}
for (const [name, event] of ALLOW) {
  const reason = decide(event);
  if (reason) {
    console.error(`FAIL (should allow) ${name}\n  ${reason}`);
    failed += 1;
  }
}

console.log(`${DENY.length} deny cases, ${ALLOW.length} allow cases, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

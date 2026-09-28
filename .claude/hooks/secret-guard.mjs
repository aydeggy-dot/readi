#!/usr/bin/env node
/**
 * PreToolUse guard: a secret file cannot be opened, so it cannot be printed.
 *
 * ## Why this exists
 *
 * On 2026-09-27 an `ANTHROPIC_API_KEY` was printed into a session transcript by a `grep` over an env
 * file whose redaction pattern did not match the line it was meant to redact. The rule "never print
 * secrets" was in CLAUDE.md and was being followed as far as its author could tell; what failed was a
 * regex. The owner's instruction was that printing a secret should be **impossible, not forbidden** —
 * so this blocks the reach for the file, which is the step that can be checked exactly, rather than
 * the redaction of its contents, which cannot.
 *
 * It is deliberately blunt in one direction: it never inspects output and never tries to decide
 * whether a particular read is safe. Every path below is refused, and the one legitimate question
 * anyone has actually needed to ask of these files — "is this variable set?" — has its own answer in
 * `scripts/env-has.sh`, which prints `set`, `empty` or `missing` and never a value.
 *
 * ## What it does not cover, said plainly
 *
 * - **It guards reading, not writing.** `Write` and `Edit` are checked by their target path, not their
 *   content: a file *about* secrets (this one, a test, a runbook) must remain editable. Writing a
 *   secret into a tracked file is a different failure with a different guard — review.
 * - **It cannot catch a secret that arrives another way**: an API that echoes a key, a log line, a
 *   `docker inspect`, a value pasted into the conversation. A `PostToolUse` hook cannot help there
 *   either — by the time it runs the output is already in the transcript and nothing in the hook
 *   contract lets it unsee. So this is one narrow reliable guard rather than a broad unreliable one,
 *   and not printing secrets still matters everywhere it does not reach.
 */

const SAFE_SUFFIXES = [".example", ".sample", ".template", ".dist", ".md"];

/** Is this basename a secret file? Names, not contents — the whole point is that we never look. */
function isSecretName(name) {
  if (SAFE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return false;
  // .env, .env.local, .env.test, api.env …
  if (name === ".env" || name.startsWith(".env.") || name.endsWith(".env")) return true;
  // Private keys and keystores.
  if (/\.(pem|p12|pfx|jks|keystore)$/.test(name)) return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.|$)/.test(name)) return true;
  if (name === ".npmrc" || name === ".pgpass" || name === ".netrc") return true;
  return false;
}

/**
 * Is this token a regex or a glob rather than a path?
 *
 * `grep -n "\.claude\|\.env" .gitignore` searches *for* the text; it does not open a file. The first
 * version of this guard blocked that command, on its own author, within a minute of going live — and
 * a guard that blocks ordinary work gets switched off, after which it guards nothing. A backslash
 * escape settles the case exactly: no path in this repository contains one, and `\.` is regex.
 *
 * **The residual false positive is deliberate and is not fixable from here**: a *plain* quoted
 * `".env"` used as a search string cannot be told from a path without knowing what the command does
 * with it, so it is still refused. That is the right way round — a refusal is loud, says why, and
 * tells you to run it yourself, where a missed secret is silent and permanent.
 */
const PATTERN_CHARS = /[\\|^$*?[\]()+]/;

/** The secret-looking paths in a string — a file path, or anything path-shaped in a command. */
function secretPathsIn(text) {
  if (typeof text !== "string") return [];
  const found = new Set();
  // Path-shaped runs, including a bare `.env`. Backslash and the regex characters are inside the
  // class so an escaped token is seen whole and can be recognised as a pattern, rather than split
  // into fragments that look like paths.
  for (const token of text.match(/[\w.~@/\\|^$*?[\]()+-]+/g) ?? []) {
    if (PATTERN_CHARS.test(token)) continue;
    const name = token.split("/").pop() ?? "";
    if (name && isSecretName(name)) found.add(token);
  }
  return [...found];
}

/**
 * The one hole, and it is exact rather than a pattern: `scripts/env-has.sh` answers "is this variable
 * set?" without printing a value. Chaining is refused — `env-has.sh … ; cat .env` must not be allowed
 * by its first word — so the command must be that script and nothing else.
 */
function isEnvHasCall(command) {
  if (/[;&|`$><]/.test(command)) return false;
  return /^\s*(?:bash\s+)?(?:\.\/)?(?:.*\/)?scripts\/env-has\.sh\s+\S/.test(command.trim());
}

/** Every string in a tool's input that could name a file, by tool. */
function targets(toolName, input) {
  if (!input || typeof input !== "object") return [];
  switch (toolName) {
    case "Bash":
      return [input.command];
    case "Read":
    case "Edit":
    case "Write":
    case "NotebookEdit":
      return [input.file_path, input.notebook_path];
    case "Grep":
    case "Glob":
      return [input.path, input.glob, input.pattern];
    default:
      return [];
  }
}

function decide(event) {
  const toolName = event.tool_name;
  const input = event.tool_input ?? {};
  if (toolName === "Bash" && typeof input.command === "string" && isEnvHasCall(input.command)) {
    return null;
  }
  const hits = targets(toolName, input)
    .flatMap((value) => secretPathsIn(value))
    .slice(0, 5);
  if (hits.length === 0) return null;
  return (
    `Blocked: ${hits.join(", ")} holds secrets, and this guard refuses the file rather than ` +
    "trusting a redaction (.claude/hooks/secret-guard.mjs). " +
    "To check whether a variable is set without revealing it: " +
    "`scripts/env-has.sh <file> <VAR>` → set | empty | missing. " +
    "To read or edit it, do it yourself — in Claude Code, `! <command>` runs in your own shell. " +
    "Tracked templates such as `.env.example` are not blocked."
  );
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    // A payload we cannot parse is not a reason to block every tool call in the session.
    process.exit(0);
  }
  const reason = decide(event);
  if (!reason) process.exit(0);
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
});

export { decide, isEnvHasCall, isSecretName, secretPathsIn };

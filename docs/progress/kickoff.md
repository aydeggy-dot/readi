# Kickoff — analysis and decisions

**Date:** 2026-09-19 · **Status:** decisions accepted; Milestone M0 not started.

## 1. What we are building (as understood at kickoff)

Readi is an AI interview-prep platform for tech candidates (Frontend, Backend, QA first; DevOps later),
launching in Nigeria and open worldwide, priced in NGN and USD. A candidate creates a profile (role, level, CV,
consents), takes a ~15-min diagnostic that seeds a readiness score and study plan, then practises text or voice
mock interviews. The interview runs as a deterministic state machine owned by our code with time and question
budgets; the LLM only phrases questions and writes follow-ups that probe missing rubric points. Each answer is
scored against its rubric with evidence quoted from the transcript; the report is assembled in code. Voice
sessions add delivery coaching. A versioned readiness formula updates after every session. Access is governed
only by entitlements from verified, idempotent Paystack/Stripe webhooks or audited admin actions. Content goes
through draft → review → published, and experts calibrate the AI evaluator. Constraints: mobile-first,
low-bandwidth, accent-robust, privacy by default (NDPA 2023), no dark patterns, never live-interview assistance.

## 2. Development environment

Development moves to **WSL (Ubuntu)**, where Docker already runs. Windows-specific workarounds from the kickoff
analysis (LiveKit UDP limitations of Docker Desktop on Windows) are dropped.

Prerequisites inside WSL:

| Tool | Version | Check |
|---|---|---|
| Node | 24 LTS (pinned via `.nvmrc` + `engines`) | `node -v` |
| pnpm | 10.x via corepack (pinned in `packageManager`) | `corepack enable pnpm && pnpm -v` |
| uv | latest | `uv --version` |
| Python | 3.12, installed and pinned by uv | `uv python find 3.12` (or `uv python install 3.12`) |
| Docker Engine + Compose v2 | current | `docker compose version`, `docker info` (daemon running) |
| Git | any recent | `git --version` |

Notes:
- Keep the repo on the Linux filesystem (e.g. `~/code/readi`), not under `/mnt/c` — file watching and pnpm
  are far slower across the Windows mount.
- M0 adds a `pnpm doctor` script that runs the checks above, and a `.gitattributes` enforcing LF line endings.

## 3. M0 decisions (defaults accepted)

| # | Topic | Decision |
|---|---|---|
| 1 | Node | Node 24 LTS, pinned |
| 2 | Package manager | pnpm 10 via corepack, pinned in `packageManager` |
| 3 | Test runner | Vitest everywhere incl. NestJS — [ADR-0002](../adr/0002-vitest-everywhere.md) |
| 4 | API validation | Zod via `nestjs-zod` — [ADR-0003](../adr/0003-zod-source-of-truth.md) |
| 5 | Admin | `/admin` routes in `apps/web`; no `apps/admin` at MVP |
| 6 | Package scope | `@readi/*` |
| 7 | GitHub | CI workflow written locally; the owner adds the remote; Claude does not push |
| 8 | Git flow | Baseline docs committed to `main`; M0 built on `feat/m0-scaffold`, merged after review |
| 9 | Sentry / PostHog | Wired but disabled when env vars are absent |
| 10 | Design tokens | Neutral shadcn theme placeholder until brand colours exist |
| 11 | Working notes | `tasks/todo.md` + `tasks/lessons.md`; handovers in `docs/progress/<date>.md` |

## 4. Resolutions of contradictions, gaps, and risks

| # | Issue | Resolution | Recorded in |
|---|---|---|---|
| 1 | Two TS test runners (Vitest + Jest) | Vitest everywhere; SWC transform for Nest decorators | ADR-0002, CLAUDE.md §2 |
| 2 | "Zod or class-validator" | Zod via `nestjs-zod`; OpenAPI + api-client generated from Zod | ADR-0003, CLAUDE.md §2 |
| 3 | No Pydantic ↔ Zod sync mechanism | Zod is source of truth → JSON Schema → generated Pydantic; CI drift check | ADR-0003, CLAUDE.md §6 |
| 4 | `apps/admin` vs routes in web | `/admin` routes in `apps/web` behind RBAC | CLAUDE.md §3, spec §4.8 |
| 5 | Python app inside Turborepo | Thin `package.json` in `apps/ai-worker` wrapping uv/ruff/mypy/pytest | Implemented in M0 |
| 6 | LiveKit UDP on Docker Desktop (Windows) | **Dropped** — development moved to WSL with native Docker | — |
| 7 | Worker DB access unclear | Worker has no DB access; session bundle in, typed events out; Redis for ephemeral state; worker `/health` checks Redis only | ADR-0004, CLAUDE.md §2, §5 |
| 8 | Langfuse stores transcripts/CVs | Treated as a personal-data store: EU cloud, subprocessor, masking, retention, deletion | ADR-0008, CLAUDE.md §5, spec §8 |
| 9 | AI cost in cents rounds to 0; cost mixed with allowances | Integer micro-USD in separate `ai_call_log`; `UsageLedger` for allowances only (`llm_tokens` kind removed) | ADR-0007, CLAUDE.md §5, spec §6.1, §8 |
| 10 | Phone-only users vs email reminders and Paystack's email requirement | Email required at checkout; renewal reminders also by SMS (Termii) to phone sign-ups; `User.signup_method` added | CLAUDE.md §2, §5, spec §4.6, §6.1 |
| 11 | Stripe currencies (USD/GBP/EUR vs USD) | USD only at MVP; currency kept generic in schema | CLAUDE.md §2, spec §4.6 |
| 12 | 3-day reminder on weekly plans | 1 day for weekly, 3 days for monthly/annual | CLAUDE.md §5, spec §4.6 |
| 13 | Evidence rule wording differed | Non-zero scores require evidence; 0 may have none only if unaddressed | CLAUDE.md §5 (now matches spec §6.2) |
| 14 | Readiness formula gaps | Explicit constants proposed in M6; product sign-off required before v1 is final | Spec §7 |
| 15 | Topic is a free string | `Topic` + `TrackTopic(is_core)` tables; `Question.topic_id`, `Lesson.topic_id` | Spec §4.2, §6.1, §7 |
| 16 | 8-question seed bank exhausted by "last 3 sessions" exclusion | N = 3 configurable; fall back to least-recently-seen questions | Spec §4.3 |
| 17 | No embedding provider; Prisma lacks pgvector type | Voyage AI (`voyage-4`, 1024-dim) via `EmbeddingProvider`; `Unsupported` column + raw SQL | ADR-0006, CLAUDE.md §2, spec §6.1 |
| 18 | Auth: Better Auth or Clerk | Better Auth hosted in NestJS behind `AuthService`; Termii via `SmsProvider` | ADR-0005, CLAUDE.md §2 |
| 19 | Account deletion vs retained financial/audit records | Strip personal data, keep rows, replace user with tombstone id | CLAUDE.md §5, spec §8 |
| 20 | Voice latency target from Nigeria | Measure in M5; 1 s p50 is a goal, not a guarantee; fast model for the live interviewer | Deferred to M5 |
| 21 | Eval gate runs on synthetic data and costs real API calls | Eval CI job is manual-dispatch until expert-scored data exists | Deferred to M4 |
| 22 | Serwist vs Next.js bundler compatibility | Verify in M0; fall back to a webpack build if needed | Deferred to M0 |

## 5. Deferred items (by milestone)

- **M0** — Verify Serwist compatibility (#22); pin codegen tools for ADR-0003; `pnpm doctor`; `.gitattributes`;
  write ADR-0001 (monorepo and stack).
- **M1** — Confirm Better Auth mounting in NestJS and same-origin cookie setup (ADR-0005); pseudonymising
  deletion implementation (#19).
- **M2** — `Topic`/`TrackTopic` models and seed format (#15); pgvector column + HNSW index (ADR-0006).
- **M3** — Event transport between worker and API, HTTP batch vs Redis stream (ADR-0004); Langfuse retention
  mechanism and bulk trace deletion (ADR-0008); least-recently-seen fallback (#16).
- **M4** — Eval CI job as manual dispatch (#21).
- **M5** — Measure real voice latency from Nigeria against the target (#20).
- **M6** — Propose readiness constants and **wait for sign-off** before finalising formula v1 (#14).
- **M8** — Whether the email collected at checkout must be verified before use (#10) — open question;
  reminder timing and SMS (#10, #12).
- **M9** — `ai_call_log` retention / rollup policy (ADR-0007).

## 6. Known stale text in `docs/PROMPTS.md`

PROMPTS.md was not edited. Where it conflicts with the above, CLAUDE.md, the spec, and the ADRs win:

- **M0:** "GET /health on api and ai-worker (checks DB/Redis)" → the worker checks Redis only (ADR-0004).
- **M2:** "apps/admin, or /admin routes in web" → `/admin` routes in web.
- **M4:** "Cost + latency logging … to Langfuse and UsageLedger" → Langfuse and `ai_call_log` (ADR-0007).
- **M8:** "Renewal reminder email 3 days before renewal" → 1 day (weekly) / 3 days (monthly/annual), plus SMS for
  phone sign-ups.

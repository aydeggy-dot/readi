# 0004 — The AI worker has no direct database access

**Status:** Accepted · **Date:** 2026-09-19

## Context
CLAUDE.md says Postgres is "accessed via Prisma from the API", yet the interview engine (M3), the voice agent
(M5), and evaluation (M4) run in the Python AI worker and need questions, rubrics, and profile context, and
produce turns and evaluations that must be persisted. M0's worker `/health` was also specified to check the
database. Letting both a Prisma app and a Python app write the same schema creates two migration owners,
two sets of access rules, and two places where PII could leak.

## Decision
- **Only `apps/api` connects to Postgres.** Prisma owns the schema and all migrations.
- The worker is **stateless with respect to the database**:
  - **Inputs:** at session start the API supplies a *session bundle* (session config, selected question
    pool, rubrics, minimal profile context such as role/level/weak topics — no email, phone, or name).
    Evaluation, CV parsing, embeddings, and plan-summary requests carry their inputs in the request body.
  - **Outputs:** the worker emits typed events (turns, state transitions, latency samples, AI-call records)
    back to the API. Turn events are sent **off the voice latency path** (async, batched, retried).
    The API persists them idempotently keyed by `(session_id, seq)`.
  - **Ephemeral engine state** (for pause/resume and crash recovery) lives in **Redis** with a TTL.
    Postgres, via the API, remains the system of record.
- API ↔ worker calls are authenticated with a shared service credential and never exposed publicly.
- All external AI provider calls (LLM, STT, TTS, embeddings, avatar) are made from the worker, so provider
  adapters, Langfuse tracing, and AI-call records live in one place.
- The worker's `GET /health` checks **Redis** connectivity (and its own config), not the database.
- Contracts for the bundle and events are Zod schemas in `shared-types` (see ADR-0003).
- The exact transport for events (HTTP batch vs Redis stream) is chosen and recorded in Milestone M3.

## Consequences
- Single schema owner; no Python ORM, no DB credentials in the worker; smaller PII surface.
- More API surface: internal endpoints for bundles and event ingestion.
- A worker crash mid-session can lose unsent events; mitigated by Redis-backed state, retries, and the
  idempotent `(session_id, seq)` key.
- Voice latency is unaffected because no DB round-trip sits between the candidate's speech and the reply.

## Alternatives considered
- **Worker reads/writes Postgres directly (SQLAlchemy/asyncpg)** — lowest latency and simplest calls, but two
  schema owners and duplicated data-protection rules.
- **Worker read-only DB access** — still couples the worker to the Prisma schema and spreads DB credentials.

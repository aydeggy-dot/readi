# 0007 — AI cost in integer micro-USD, in a separate `ai_call_log`

**Status:** Accepted · **Date:** 2026-09-19

## Context
CLAUDE.md required every AI call to record provider, model, latency, usage, and estimated cost to
"Langfuse + `usage_ledger`", and the spec gave `UsageLedger` a `cost_minor_usd` column. Two problems:
1. **Precision:** a single fast-model LLM call or short TTS chunk costs a fraction of a US cent, so cost in
   cents rounds to 0 and per-session cost becomes meaningless.
2. **Mixed purposes:** `UsageLedger` meters customer allowances (voice minutes) that gate access and billing;
   cost accounting is an internal, per-call, high-volume record. Mixing them couples entitlement logic to
   observability data.

## Decision
- **New table `ai_call_log`**, one row per external AI call:
  `id, created_at, session_id?, user_id?, purpose (interviewer | follow_up | evaluator | cv_parse |
  plan_summary | embedding | stt | tts | avatar), provider, model, status, error_code?, latency_ms,
  input_units, output_units, unit_kind (tokens | characters | seconds), cost_micro_usd (bigint),
  langfuse_trace_id?`.
- **Cost unit: integer micro-USD** (1 USD = 1,000,000). Stored as `bigint`.
- Unit prices live in config/DB as **micro-USD per million units** (integers), keyed by provider + model +
  unit kind — never in business logic. Per-call cost = `round(units × price_per_million / 1_000_000)`,
  computed in code; rounding error is ≤ 0.5 µUSD per call.
- **`UsageLedger` is for allowance metering only** (`voice_minutes`, `avatar_minutes`). Its cost column and
  the `llm_tokens` kind are removed.
- Rows are produced in the worker (ADR-0004) and persisted by the API. Per-session cost, the average voice
  session cost, and the cost alert threshold (spec §8) are computed from `ai_call_log`.
- Customer money (prices, payments) is unchanged: integer minor units of its own currency.

## Consequences
- Accurate per-session and per-feature cost, queryable in SQL without Langfuse.
- `ai_call_log` grows fast; it contains no transcript text or PII beyond opaque ids. A retention/rollup
  policy is decided in Milestone M9.
- Price tables must be kept current when providers change pricing (admin-editable config).

## Alternatives considered
- **Decimal/numeric cost column** — works, but integer micro-units match the project's "money as integers" rule.
- **Cost only in Langfuse** — Langfuse is a trace store with retention and deletion (ADR-0008); cost history
  must outlive traces.

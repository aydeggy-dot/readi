# 0008 — Langfuse is treated as a personal-data store

**Status:** Accepted · **Date:** 2026-09-19

## Context
CLAUDE.md forbids logging transcripts, CVs, emails, or phone numbers, but also requires every AI call to be
traced to Langfuse. An LLM trace contains the prompt, and our prompts contain candidate answers and CV text.
Langfuse is therefore not a log sink we can scrub — it is a store of personal data and must follow the same
rules as our database under NDPA 2023 / GDPR.

## Decision
- **Hosting:** Langfuse Cloud in the **EU region** under a DPA for the MVP. Self-hosting remains an option if
  cost, volume, or compliance requires it (a superseding ADR would record that). Tracing is disabled when
  Langfuse env vars are absent (local dev, CI).
- **Subprocessor:** listed in `docs/privacy/subprocessors.md` with purpose, region, and data categories.
- **Identifiers:** traces carry only opaque internal ids (`user_id`, `session_id`) — never email, phone, or name.
- **Masking:** CV-parsing traces pass through the SDK masking hook to redact contact details
  (emails, phone numbers, street addresses, URLs to personal profiles) before leaving the worker.
- **Retention:** traces expire on the same schedule as recordings (default 30 days, configurable). Use
  Langfuse's project data-retention setting if our plan supports it; otherwise a scheduled job deletes
  older traces via the Langfuse API. Verified in Milestone M3.
- **Deletion and export:** account deletion also deletes that user's traces (looked up by `user_id`).
  Data export does not include traces, which are operational copies of data we already export (transcripts,
  evaluations).
- **Access:** limited to named staff with 2FA/SSO; not shared with content experts by default.
- Langfuse is **never** a substitute for application logs, and Sentry still receives no transcript text.

## Consequences
- Tracing stays useful for prompt debugging and evals while fitting the privacy rules.
- Account deletion and retention jobs gain an external dependency; failures must be retried and alerted.
- Masking can remove context useful for debugging CV parsing; accepted.

## Alternatives considered
- **Redact all candidate text from traces** — makes traces nearly useless for evaluating interviewer and
  evaluator prompts.
- **Self-host from day one** — maximum control, but significant ops burden (multiple stateful services)
  before launch.

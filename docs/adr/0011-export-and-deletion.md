# 0011 — Data export and account deletion: soft delete, a grace period, and tombstoned records

**Status:** Accepted · **Date:** 2026-09-19

## Context
The NDPA 2023 and the GDPR give people a copy of their data and its erasure on request, and the spec
promises both from day one (spec §8, kickoff decision 19). Two facts shape the design:

- Some rows must survive erasure. Audit logs are how we can show who changed what (M1), and payments,
  subscriptions and webhook events must be kept for tax and dispute reasons (M8). All of them
  reference the user.
- Deletion is irreversible and sometimes not the user's own doing: a stolen session, a shared device,
  or a moment of frustration. A deletion that erases everything the instant it is asked for cannot be
  put right, while one that never completes is not erasure at all.

Better Auth's own `deleteUser` flow was disabled in ADR-0009, so the flow is ours to define.

## Decision

**Export** — `GET /api/me/export` returns one JSON document (`DataExport` in `shared-types`) as a
download: the user record, profile, CV status with the parsed content, every consent decision ever
recorded, linked sign-in accounts, sessions, the audit entries they made or that are about them, and
the AI calls made with their data (purpose, provider, model, status — no content, no cost). It never
contains secrets: password hashes, session tokens and OAuth tokens are not selected at all, and a test
asserts none of them appear in the file. Audit entries name the actor as `you`, `admin` or `system`
rather than identifying staff. The uploaded CV file itself is not embedded: the export carries a
presigned download link valid for 15 minutes. Exports are rate limited to 5 an hour per user and
served `Cache-Control: no-store`.

Langfuse traces are not exported: they are operational copies of data the export already contains
(ADR-0008).

**Deletion in three steps** (`POST /api/me/deletion`):

1. **The ask.** The request needs the typed confirmation `DELETE` and a session created within the
   last 15 minutes; otherwise it is refused with `recent_sign_in_required` and the web app offers to
   sign in again and come back. A stolen but idle session cannot delete an account.
2. **Soft delete, then a 7-day grace period.** `users.deleted_at` and `deletion_scheduled_for` are
   set, every session is revoked, and an audit entry records the request. A Better Auth
   `session.create` hook then refuses to create a session for that user, so **every** sign-in method
   is blocked at one point — email, Google and phone OTP alike — with the code
   `ACCOUNT_DELETION_PENDING`, which the web app explains. Credentials are checked before that hook
   runs, so a stranger learns nothing. `getSession` also ignores any session that somehow exists for
   a soft-deleted user. Password-reset and verification emails are not sent to such accounts.
   The user is told by email (or SMS, for phone sign-ups) which date their data goes and where to
   write to keep it — the notice is what makes an unwanted deletion noticeable.
3. **Erasure.** An hourly BullMQ sweep erases every account whose grace period has passed: the files
   under `cvs/<user>/` first, then, in one transaction, the `users` row (cascading to sessions,
   accounts, profile with the parsed CV, and consent records) and any pending verification codes.
   A sweep, rather than one delayed job per user, keeps the database the only record of what is due:
   nothing is lost if Redis is flushed, a failed run is simply retried by the next one, and a
   cancelled deletion needs no job removed. One user's failure does not stop the others.

Unconfirmed uploads live under `cv-uploads/<upload id>`, outside the user's folder, so erasure does
not delete them; the bucket rule that expires them after a day always fires long before the grace
period ends. Expired verification codes (phone OTPs keyed by the number itself) are dropped by the
same hourly sweep, because people who never finish signing up leave no account to erase.

**Tombstones.** Rows that must be kept reference users by plain uuid **without a foreign key**, so
erasure can replace that id with a fresh `user_tombstones` id: `audit_logs.actor_id`,
`audit_logs.target_id` and `ai_call_log.user_id` today. One tombstone per erased user keeps their
kept rows related to each other, and nothing maps a tombstone back to the person. Every other user
reference is a foreign key with `ON DELETE CASCADE`; an integration test reads the live schema and
fails if a new uuid column referencing a user appears that is neither cascading nor tombstoned, so
the M8 payment tables cannot quietly miss this.

**Cancelling** is an audited admin action during the grace period only
(`pnpm --filter @readi/api admin:cancel-deletion -- --email … | --phone …`), after the user asks
support. Self-service cancellation would need a signed-in user, and being signed in is exactly what a
deleted account cannot be. Once the grace period is over, cancelling is refused: erasure may already
be under way.

**Support address.** `SUPPORT_EMAIL` (API, for the notices) and `NEXT_PUBLIC_SUPPORT_EMAIL` (web, for
the screens) hold the address users write to. Both are required in production and both refuse a
`.invalid` placeholder there.

## Consequences
- An email address or phone number stays taken during the grace period; the person cannot sign up
  again with it until erasure. Acceptable for a 7-day window, and the notice explains it.
- Support needs shell access to cancel a deletion. An admin screen can replace the CLI when the
  admin panel grows (M2+); the audited service function is already separate from the CLI.
- Every future table holding personal data must be reachable by cascade from `users`, or be added to
  `TOMBSTONED_COLUMNS` with the erasure step that rewrites it. The schema test is the reminder.
- Langfuse (M3) and recordings (M5) join the erasure step when they arrive; ADR-0008 already requires
  trace deletion by user id.
- The export is a single response built in memory. That is fine for M1's volumes; when transcripts
  and recordings arrive it becomes a background job producing a file in object storage.

## Alternatives considered
- **Immediate hard delete.** Honest and simple, but a mistaken or hostile deletion is unrecoverable,
  and the person only finds out when they cannot sign in.
- **Self-service cancellation during the grace period** (sign in, "keep my account"). Better for the
  user, but it means letting a soft-deleted account sign in, which weakens the one rule that makes
  the block simple to reason about. Revisit when there is an account-recovery flow.
- **One delayed job per user** instead of a sweep. Fewer queries, but Redis then holds state the
  database does not, and cancellation has to chase the job.
- **Keeping the user row with its personal columns nulled.** Fewer moving parts than tombstones, but
  the row's id remains a stable identifier of a person we promised to erase.
- **Exporting Langfuse traces and cost figures.** Traces duplicate exported data (ADR-0008), and cost
  in micro-USD is our accounting, not the user's data.

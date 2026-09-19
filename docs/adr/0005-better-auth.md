# 0005 — Better Auth, hosted in the NestJS API

**Status:** Accepted · **Date:** 2026-09-19

## Context
CLAUDE.md left auth as "Better Auth or Clerk". Requirements: email + password, Google, phone OTP for Nigerian
numbers via **Termii**, httpOnly-cookie sessions for the web, RBAC, data export and account deletion from day
one, and NDPA 2023 / GDPR data control. Clerk is a hosted user store with its own SMS delivery, which
conflicts with Termii OTP, puts the user record in a third-party store we must export from and delete in, and
is billed per active user in USD.

## Decision
- Use **Better Auth**, running **inside `apps/api`** and persisting to our Postgres via its Prisma adapter.
- Methods: email + password, Google (social provider), phone number OTP. Phone OTP delivery goes through our
  own `SmsProvider` interface with a **Termii** implementation and a **console/dev** implementation that logs
  OTPs locally. The same `SmsProvider` sends SMS renewal reminders.
- The rest of the codebase depends on our own **`AuthService`** interface, never on Better Auth types
  directly, so the library can be swapped.
- Sessions use httpOnly, `Secure`, `SameSite=Lax` cookies. The web app reaches the API same-origin (Next.js
  rewrite/proxy) so cookies stay first-party; the precise setup is confirmed in Milestone M1.
- Better Auth's user/session/account/verification tables are part of our Prisma schema and covered by data
  export and account deletion. RBAC roles live on our `User` model.
- Rate limits on login, signup, and OTP are enforced (library limits plus our own API rate limiting).

## Consequences
- All identity data stays in our database; export and deletion are ordinary queries.
- We own SMS cost and OTP deliverability (Termii), including abuse protection (rate limits, per-number caps).
- NestJS integration of Better Auth is less documented than the Next.js one; M1 verifies the handler
  mounting and guard wiring before building on it.

## Alternatives considered
- **Clerk** — fastest to start; rejected for data residency, Termii mismatch, and export/deletion via a third party.
- **Auth.js** — oriented to Next.js as the backend; our backend is NestJS.
- **Hand-rolled auth** — unnecessary security risk.

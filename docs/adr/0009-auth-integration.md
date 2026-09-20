# 0009 — Auth integration: Better Auth in NestJS, same-origin cookies, trusted client IP

**Status:** Accepted · **Date:** 2026-09-19

## Context
ADR-0005 chose Better Auth hosted in the API behind our own `AuthService`, and deferred the NestJS
mounting, the cookie setup, and abuse controls to Milestone M1. Three facts shaped the details:
- Better Auth requires an email on every user, but phone sign-ups have none (spec §6.1 `email?`).
- The browser reaches the API only through the web app's `/api/*` rewrite (ADR-0005), and Next.js
  (`next start`) forwards the client's `X-Forwarded-For` **verbatim** and adds nothing: an attacker
  can choose their own rate-limit bucket, and without the header every client shares one bucket.
  (Verified in M1 against a header-echo server.)
- Rewrite destinations in `next.config.ts` are fixed at **build** time.

## Decision
**Mounting.** Better Auth 1.7 runs inside `apps/api` via `toNodeHandler`, mounted on Express at
`/api/auth/*` before the JSON body parser (the app is created with `bodyParser: false`). All API
routes live under `/api` (`/health` excluded), and the web rewrite keeps the path, so Better Auth's
`baseURL` is the web origin (`PUBLIC_WEB_URL`) and cookies are first-party: `readi.*`, httpOnly,
`SameSite=Lax`, `Secure` over HTTPS. `trustedOrigins` is the web origin. Telemetry is disabled.

**Our boundary.** Controllers and guards depend on `AuthService` (`getSession`, `revokeAllSessions`);
only `BetterAuthService` and the auth wiring import Better Auth. A global `AuthGuard` denies every
route unless it is marked `@Public()`; `@Roles()` restricts further (RBAC roles live on `users.role`).

**Data.** Better Auth's user/session/account/verification models are Prisma models (`users`,
`sessions`, `accounts`, `verifications`; UUID ids). Extra user fields (`role`, `signup_method`,
`country`, `locale`, `deleted_at`, `deletion_scheduled_for`) are `input: false`: Better Auth ignores
a client-supplied `role` (it has a default) and rejects the others with 400; tests pin both behaviours.
`signup_method` is set from the creating route in a database hook, and an unknown route refuses sign-up.

**Phone sign-ups** (Nigerian mobiles only, E.164, validated with libphonenumber-js) receive a random
placeholder email `user-<uuid>@phone.readi.invalid`. `.invalid` is a reserved TLD (RFC 2606); the
placeholder never contains the phone number, is exposed as `email: null`, and `EmailSender` refuses
to send to any `.invalid` address whatever the provider. Checkout (M8) asks for a real email.

**Providers.** `EmailSender` (Resend) and `SmsProvider` (Termii, DND channel) have console
implementations for development that write to a Redis-backed **dev mailbox** (`GET /api/dev/mailbox`)
so developers and e2e tests can read OTPs and links. The dev mailbox module is not imported at all
when `NODE_ENV=production`, and production configuration rejects console providers (both tested).

**Rate limits.** Better Auth's limiter uses our atomic Redis limiter (Lua): sign-in 5/min, sign-up
10/h, OTP send 3/min, OTP verify 10/min, password reset and verification email 5/h, per client IP;
plus per-number OTP caps (5/h, 10/day) inside `sendOTP`.

**Trusted client IP.** Better Auth reads the client IP only from `x-readi-client-ip`. The web app's
`proxy.ts` deletes any client-supplied copy, sets it from the hosting edge's single-value client-IP
header (`CLIENT_IP_HEADER`, e.g. `cf-connecting-ip`), and adds `x-readi-proxy-secret`. The API keeps
the IP header only when that secret matches `WEB_PROXY_SECRET` (timing-safe) and always strips the
secret. Both settings are required in production. Locally (no edge) no IP is forwarded, so auth
routes share one bucket per route — acceptable for development only.

## Consequences
- Placeholder emails are an invariant every email path must respect; `EmailSender` enforces it.
- A new sign-up method needs a deliberate `signup_method` mapping (the hook fails closed).
- Deployment must provide an edge that sets a trustworthy single-value client-IP header, set the
  same `WEB_PROXY_SECRET` on web and API, and set `API_INTERNAL_URL` when **building** the web app.
- The API must not be exposed publicly; even if it were, clients cannot set their own IP without the secret.

## Alternatives considered
- **Community NestJS wrapper** (`@thallesp/nestjs-better-auth`) — single maintainer; the integration is
  ~100 lines we can test directly.
- **Trusting `X-Forwarded-For`** (or Better Auth `trustedProxies`) — the rewrite passes client values
  through unchanged, so the chain cannot be trusted without an edge in front.
- **Nullable email with a custom auth store** — fights the library; the placeholder keeps Better Auth
  stock while the rest of the system treats email as optional.

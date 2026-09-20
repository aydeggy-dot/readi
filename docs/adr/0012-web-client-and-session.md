# 0012 — Web client: generated API client, server-resolved sessions, forms without Zod

**Status:** Accepted · **Date:** 2026-09-19

## Context
M1 phase 2 is the first web code that calls the API with a user's session: sign-up, onboarding,
profile and consent. Constraints: ADR-0003 (Zod is the contract source of truth), ADR-0009 (same-origin
`/api/*`, first-party cookies), CLAUDE.md (no Zod or heavy libraries in browser bundles; route bundles
small on Slow 4G), and the web app must not trust anything the browser tells it about who is signed in.

## Decision
**Generated API client.** `packages/api-client` holds the OpenAPI document and TypeScript types
generated from it (`openapi-typescript`), plus a thin wrapper over `openapi-fetch` (~6 KB, no Zod).
The API exports the document with `export-openapi`, which builds the Nest module graph in `preview`
mode: no database, Redis or `.env` needed, so the CI contract-drift job can run it. `pnpm gen:contracts`
regenerates it and `pnpm check:contracts` fails on drift; an API test also asserts the committed
document equals what the running app serves.

**Sessions are resolved on the server.** Server components call `getMe()` (`GET /api/me` with the
request's cookie, cached per request) through `requireUser()`, `requireOnboarded()` and
`requireAdmin()`. `proxy.ts` only redirects visitors without a session cookie to `/login?next=…` (a fast
path; the cookie may be stale). Admin pages answer 404 to non-admins; the API enforces 403 regardless.
`/status` is admin-only when `APP_ENV=production`. Post-login redirects accept same-site paths only.

**Auth calls use the Better Auth browser client** (same version as the API), created lazily in event
handlers. Better Auth error codes map to translated copy in one function; unknown errors never show the
server's English message.

**Forms use react-hook-form's built-in rules**, not Zod resolvers. The API validates authoritatively;
its 400 bodies list field paths, and domain errors carry a stable `code` (`ApiError`), both mapped to
translated messages. A lint rule forbids value imports of `@readi/shared-types` and `zod` in components
and shared web helpers; plain values come from the Zod-free `@readi/shared-types/constants` entry.

**TanStack Query is deferred** until a page needs client-side caching or polling (CV parse status, M1
phase 3). Phase 2 pages render on the server and mutate with plain calls followed by `router.refresh()`.

## Consequences
- Contract changes flow Zod → DTO → OpenAPI → client types; a type error in the web app is the signal.
- A bare `z.string().nullable()` becomes `type: ["string","null"]`, which `@nestjs/swagger` turns into an
  array. Nullable strings need a constraint (format, pattern, length); a shared-types test enforces it.
- Server-side calls go to `API_INTERNAL_URL` at runtime, while the `/api/*` rewrite is fixed at build
  time (ADR-0009): both must point at the same API.
- Better Auth refreshes session expiry in the database, but the refreshed cookie only reaches the browser
  from Better Auth's own endpoints; cookies therefore expire 30 days after sign-in. Revisit if needed.

## Alternatives considered
- **Hand-written fetch wrappers validated with shared Zod schemas** — would put Zod in the browser.
- **Server actions for all mutations** — attractive, but auth cookies are set by Better Auth responses
  and the API is the single enforcement point; one pattern (client → `/api/*`) is simpler to reason about.
- **Orval / openapi-generator** — heavier generated code; `openapi-fetch` keeps the runtime tiny.

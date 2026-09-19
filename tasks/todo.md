# Working notes — todo

## M0 — scaffold (branch `feat/m0-scaffold`, awaiting owner review; do not merge until approved)

- [x] Workspace root, shared config, pnpm 12 build approvals
- [x] Local infra (pgvector, redis, SeaweedFS, livekit) on non-default ports
- [x] shared-types + contract codegen (Zod → JSON Schema → Pydantic) + drift check
- [x] ai-worker (FastAPI, settings, /health Redis-only)
- [x] api (Nest 11, Prisma 7, /health DB + Redis, OpenAPI)
- [x] web (Next 16, Tailwind 4, shadcn, i18n, /status, Serwist, lazy Sentry/PostHog)
- [x] CI workflow (actionlint clean)
- [x] Docs: ADR-0001, README, CLAUDE.md, handover

## M0 review follow-ups (2026-09-19)

- [x] B1 worker Sentry sent request bodies / frame locals by default → disabled + tested
- [x] S1 turbo strict env mode dropped API_INTERNAL_URL/SENTRY_DSN → declared in turbo.json
- [x] S2 /status showed raw error codes → translated via row builder with tests
- [x] S3 service worker active in `next dev` → disabled in development
- [x] S4 API startup failure was an unhandled rejection → logged, reported, exit 1
- [x] N1 worker docs served in production → disabled
- [x] S5a (M1 phase 1) default-deny global guard; `/health` explicitly `@Public()`
- [x] S5b (M1 phase 2) `/status` admin-only in production, public in development (owner decision 5)
- [ ] N4 (M10) remove the landing-page link to `/status` before launch

## M1 — auth, profile, consent, onboarding (branch `feat/m1-auth-onboarding`)

Decisions (owner, 2026-09-19): defaults for 2–5 and 8; CV-parse model `claude-sonnet-5` plus a
side-by-side comparison script; Langfuse deferred to M3 (`ai_call_log` only); stop after each phase.

- [x] Phase 1 — API foundation: Better Auth in Nest (ADR-0009), default-deny guard + RBAC, email/SMS
      providers + dev mailbox (not registered in production), `.invalid` refusal, rate limits + OTP caps,
      trusted client IP via web proxy secret, PII log scrubbing (Nest + Python), audit log, `admin:grant`
- [x] Phase 2 — web auth + onboarding UI (api-client generation, pages, proxy.ts redirects, /status admin-only in prod)
  - [x] Contracts: profile enums + request/response, consent types/versions, onboarding state on `MeResponse`
  - [x] API: `profiles` + `consents` modules, `me/onboarding/complete`, public `auth-methods`; migration; tests
  - [x] `packages/api-client`: OpenAPI export (no DB needed) → openapi-typescript → openapi-fetch; drift check
  - [x] Web: auth pages (email sign-up/login, Google, phone OTP, forgot/reset password), onboarding
        (profile → consent → home with diagnostic placeholder), profile view/edit, consent edit, `/admin`
  - [x] Web: `proxy.ts` redirects without a session cookie; server-side session via `/api/me`; `/status`
        admin-only when `APP_ENV=production` (S5b)
  - [x] Verify in Chromium at 360px and Slow 4G; docs (ADR-0012 web client, CLAUDE.md, README)
  - Deferred: TanStack Query to phase 3 (first client-side polling: CV parse status); PostHog events
    (`signup_completed`, `profile_completed`, `consent_updated`) to M9 with the typed event helper; the CV
    step joins onboarding in phase 3 (`OnboardingSteps`).
  - Known: refreshed session expiry does not reach the browser cookie (expires 30 days after sign-in).
- [ ] Phase 3 — CV pipeline (bucket CORS, presign/confirm, BullMQ, worker /cv/parse, ai_call_log, compare script)
- [ ] Phase 4 — export + deletion (ADR-0011 tombstones)
- [ ] Phase 5 — Playwright e2e + CI job, ADR-0010/0011, subprocessors, docs, review (ADR-0012 written in phase 2)

## Carried forward

- M1: set bucket CORS for presigned uploads (`PutBucketCors` works on SeaweedFS and R2).
- M1: install Playwright with the first e2e test (email signup → onboarding). Right after Playwright is
  added to the repo, tell the owner to install Chromium's system libraries by running:
  `sudo env "PATH=$PATH" pnpm exec playwright install-deps chromium`
  (`sudo` alone cannot see pnpm, which nvm installs under the home folder). Until then, the
  `mcr.microsoft.com/playwright:v1.62.1-noble` image with `--network host` works (used for the M0 360px check).
- M1: authenticate API ↔ worker calls with a service credential (ADR-0004) when the first real call lands.
- M10: PNG PWA icons (192/512, maskable), Lighthouse pass (landing page ships ~180 KB gzip JS today).
- M10: Sentry source-map upload (`@sentry/cli` build script is denied until then).

## Repository

- Done (owner, 2026-09-19): the old Windows `origin` was removed; `origin` is now the private GitHub repo
  `git@github.com:aydeggy-dot/readi.git`, with `main` and `feat/m0-scaffold` pushed. No remote action needed.
- The owner pushes; Claude commits locally and does not push unless asked.
- 2026-09-19 (M1 phase 2 start): GitHub `main` was still `80ef242` (M0 not merged there yet), so there was
  nothing to rebase; `feat/m1-auth-onboarding` stacks on the M0 commits. After M0 lands on `main`: a
  merge commit or fast-forward needs no action; after a squash merge run
  `git rebase --onto origin/main feat/m0-scaffold feat/m1-auth-onboarding`.

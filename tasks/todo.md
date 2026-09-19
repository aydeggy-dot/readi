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
- [ ] S5 (M1, needs auth) default-deny global guard; mark `/health` explicitly public; decide with the owner
      whether `/status` stays public in production or shows only an overall status
- [ ] N4 (M10) remove the landing-page link to `/status` before launch

## Carried forward

- M1: set bucket CORS for presigned uploads (`PutBucketCors` works on SeaweedFS and R2).
- M1: install Playwright with the first e2e test (email signup → onboarding). Local runs need Chromium's
  system libraries (`sudo pnpm exec playwright install-deps chromium`) or the
  `mcr.microsoft.com/playwright:v1.62.1-noble` image with `--network host` (used for the M0 360px check).
- M1: generate `packages/api-client` from the OpenAPI document once the browser calls the API.
- M1: authenticate API ↔ worker calls with a service credential (ADR-0004) when the first real call lands.
- M10: PNG PWA icons (192/512, maskable), Lighthouse pass (landing page ships ~180 KB gzip JS today).
- M10: Sentry source-map upload (`@sentry/cli` build script is denied until then).
- Owner: remove the dangling `origin` remote (points at the archived Windows copy) and add the GitHub remote.

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

## Carried forward

- M1: set bucket CORS for presigned uploads (`PutBucketCors` works on SeaweedFS and R2).
- M1: install Playwright with the first e2e test (email signup → onboarding).
- M1: generate `packages/api-client` from the OpenAPI document once the browser calls the API.
- M1: authenticate API ↔ worker calls with a service credential (ADR-0004) when the first real call lands.
- M10: PNG PWA icons (192/512, maskable), Lighthouse pass (landing page ships ~180 KB gzip JS today).
- M10: Sentry source-map upload (`@sentry/cli` build script is denied until then).
- Owner: remove the dangling `origin` remote (points at the archived Windows copy) and add the GitHub remote.

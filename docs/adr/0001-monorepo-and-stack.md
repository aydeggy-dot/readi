# 0001 — Monorepo layout, stack versions, and local infrastructure

**Status:** Accepted · **Date:** 2026-09-19

## Context
CLAUDE.md §2 fixes the stack at the level of products (Next.js, NestJS, FastAPI, Postgres, …). Milestone M0
turns that into a working monorepo, which needs concrete versions, a pinning policy, and a local
infrastructure layout that coexists with other Docker stacks on the development machine (which already
publishes 5432, 6379, 3000, and others). Several "latest" releases turned out to be incompatible with each
other or with accepted ADRs, and MinIO — named in CLAUDE.md for local S3 — is no longer maintained.

## Decision

### Layout
Turborepo + pnpm workspaces: `apps/{web,api,ai-worker}`, `packages/{shared-types,api-client,ui,config}`,
`infra/docker-compose.yml` (see CLAUDE.md §3). The Python worker is a uv project with a thin `package.json`
so `turbo run lint|typecheck|test` covers it (ruff, mypy, pytest).

### Version policy
- **Direct dependencies are pinned exactly** (npm: exact versions in `package.json`; Python: `==` in
  `pyproject.toml`); lockfiles (`pnpm-lock.yaml`, `uv.lock`) pin the rest. Docker images and GitHub Actions
  are pinned (actions by commit SHA).
- **Maturity rule:** pick the newest *minor line* whose first release is at least ~3 weeks old, then its
  latest patch. If a newest release causes trouble, step back one minor/major rather than add workarounds.
- pnpm 12's default minimum-release-age window stays on; pins should not need `minimumReleaseAgeExclude`.
- **Dependency build scripts** must be approved explicitly in `allowBuilds` (`pnpm-workspace.yaml`); pnpm 12
  fails the install otherwise. Each entry is commented; telemetry/banners are denied.

### Versions chosen (and why not the newest)
| Area | Choice | Note |
|---|---|---|
| Node | 24 LTS | `.nvmrc`, `engines` |
| pnpm | 12.4.2 | Replaces pnpm 10 (kickoff §7); verified with Turborepo (install, run, prune) |
| Turborepo | 2.10.13 | 2.11 is < 3 weeks old |
| TypeScript | **6.0.3** | TS 7.0 (native) is out, but typescript-eslint supports `<6.1` only |
| ESLint | **9.39.5** | ESLint 10 is out, but eslint-config-next's plugins (react, import, jsx-a11y) support ≤ 9 |
| typescript-eslint | 8.68.0 | type-checked rules |
| Vitest | **4.1.11** | Vitest 5.0 is < 1 week old |
| Next.js / React | 16.3.5 / 19.2.8 | Turbopack build |
| Tailwind CSS | 4.3.3 | shadcn/ui (new-york, neutral) |
| NestJS | **11.2.5** | Nest 12 is out, but `nestjs-zod` (ADR-0003) supports Nest 10–11 only; `@nestjs/swagger` 11.4.7 |
| nestjs-zod / Zod | 5.5.0 / 4.5.4 | |
| Prisma | **7.10.0** | npm's `latest` tag points at 8.0.0-rc; Prisma 7 uses `prisma.config.ts` + the `pg` driver adapter |
| ioredis | 6.0.0 | BullMQ 6 accepts ioredis ≥ 5 as a peer |
| Serwist | 9.5.12 (`@serwist/turbopack`) | Works with the Turbopack build — no webpack fallback needed (kickoff #22) |
| Python | 3.12 (uv) | FastAPI 0.141.1, Pydantic 2.13.5, pydantic-settings 2.15.0, redis-py 8.1.0, ruff 0.16.8, mypy 2.3.1, pytest 9.1.1 |
| Contract codegen | Zod `z.toJSONSchema` → datamodel-code-generator 0.76.2 | ADR-0003 |
| Postgres | `pgvector/pgvector:0.8.6-pg16` | same image in CI |
| Redis | `redis:8.8.2-alpine` | |
| LiveKit | `livekit/livekit-server:v1.13.7` (`--dev`) | |
| Local S3 | `chrislusf/seaweedfs:4.44` | see below |

Upgrade triggers: move to Nest 12 when `nestjs-zod` supports it; to TypeScript 7 when typescript-eslint
does; to ESLint 10 when eslint-config-next's plugins do.

### Local S3: SeaweedFS instead of MinIO
MinIO's community repository is marked **"no longer maintained"** (last release 2025-10-15), and
`minio/minio` is gone from Docker Hub; only old tags remain on quay.io. Candidates were run in throwaway
containers and tested for what the product needs from storage (M1 presigned CV upload from the browser,
recording retention later):

| Check | MinIO (last image, pinned) | SeaweedFS 4.44 | VersityGW 1.7.0 |
|---|---|---|---|
| Create bucket | ✓ | ✓ | ✓ |
| `PutBucketCors` (R2 supports it) | ✗ NotImplemented | ✓ | ✓ |
| CORS preflight for presigned PUT | ✓ (allow-all) | ✓ | ✓ |
| Presigned PUT / GET | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| Lifecycle expiry rules (R2 supports them) | ✓ | ✓ | ✗ NotImplemented |
| Rejects bad credentials | ✓ | ✓ | — |
| Maintained | ✗ (no fixes, image may vanish) | ✓ weekly releases, Apache-2.0 | ✓ Apache-2.0 |

**Decision:** SeaweedFS 4.44 for local development (compose service `s3`, one-off `s3-init` creates the
bucket). It passed every check, including the two R2 features MinIO or VersityGW lack, so local behaviour
matches production more closely. RustFS (1.0.0 released 3 days before this decision) failed the maturity
rule. **Production stays on Cloudflare R2.** Application code talks plain S3 (endpoint, region, path-style
addressing via env), so the local store is swappable.

### Local ports
All published on `127.0.0.1` only, compose project `readi`, each overridable in `infra/.env`:

| Service | Host port |
|---|---|
| Postgres | 15432 |
| Redis | 16379 |
| S3 (SeaweedFS) | 19000 |
| LiveKit | 7880 (HTTP/WS), 7881/tcp, 7882/udp |
| Web (Next.js dev) | 3002 |
| API (NestJS) | 4000 |
| AI worker (FastAPI) | 8000 |

### Conventions established in M0
- **Cross-language contract naming:** registered (top-level) contracts carry no root `.meta({ id })` and are
  named by their registry key; reusable nested building blocks carry an id. nestjs-zod 5.5 emits duplicate
  OpenAPI components for a DTO whose root schema has an id. Wire fields are `snake_case` (spec §6.2 style).
- **Browser bundles stay small:** browser modules never import Zod (~60 KB gzip); `NEXT_PUBLIC_*` values are
  validated at build time in `next.config.ts`. Sentry and PostHog SDKs are dynamically imported only when
  their keys are set. The service worker precaches only the offline page; other assets are cached at
  runtime as they are used.
- **i18n:** a small typed `t()` over `apps/web/src/i18n/messages/en.json`; revisit (e.g. next-intl) when a
  second locale is added.
- **Env loading:** Node's built-in `process.loadEnvFile` (no dotenv); variables already set win.
- **Fail fast on configuration, not on dependencies:** invalid env stops the process with a message naming
  each variable (never its value); an unavailable DB/Redis is reported by `/health` (503) instead.

## Consequences
- Several major versions lag the newest release on purpose; the upgrade triggers above say when to revisit.
- SeaweedFS replaces MinIO in CLAUDE.md §2/§3; its CLI (`weed shell`) differs from `mc`.
- Exact pins mean dependency updates are explicit commits (a Renovate/Dependabot setup can follow later).
- LiveKit media over UDP from a Windows browser into WSL (NAT mode) is not forwarded; expect ICE-TCP (7881)
  locally. Voice latency must be measured in a realistic setup in M5.

## Alternatives considered
- **Newest everything** (TS 7, ESLint 10, Nest 12, Vitest 5, Prisma 8 RC) — each conflicts with a peer
  dependency or an accepted ADR, or is too new.
- **Pinning the last MinIO image** — works today, but no security fixes and the image is already gone from
  Docker Hub; lacks `PutBucketCors`.
- **VersityGW** — smallest and simplest, but no lifecycle rules.
- **Garage** — maintained, but requires multi-step layout/key initialisation; heavier for a dev stack.

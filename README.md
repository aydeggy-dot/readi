# Readi

AI-powered tech interview preparation, launching first in Nigeria. Product spec: `docs/PRODUCT_SPEC.md`;
engineering rules: `CLAUDE.md`; decisions: `docs/adr/`.

## Prerequisites

Node 24 LTS, pnpm 12 (via corepack), uv (manages Python 3.12), Docker Engine with Compose v2, Git.
On Windows, work inside WSL with the repo on the Linux filesystem (not under `/mnt/c`).

```bash
corepack enable pnpm
pnpm prereqs            # checks all of the above
```

## Setup

```bash
# 1. Local infrastructure: Postgres + pgvector, Redis, S3 (SeaweedFS), LiveKit — ports in ADR-0001
docker compose -f infra/docker-compose.yml up -d

# 2. Configuration (defaults point at the compose services)
cp apps/api/.env.example apps/api/.env
cp apps/ai-worker/.env.example apps/ai-worker/.env
cp apps/web/.env.example apps/web/.env.local
# In apps/api/.env set BETTER_AUTH_SECRET, the same WEB_PROXY_SECRET in api and web, and the same
# value as AI_WORKER_TOKEN (api) and SERVICE_TOKEN (ai-worker). Generate each with:
openssl rand -base64 48
# CV parsing: ANTHROPIC_API_KEY in apps/ai-worker/.env, or LLM_PROVIDER=fake to work without one.

# 3. Dependencies, database and storage
pnpm install
(cd apps/ai-worker && uv sync)
pnpm db:migrate
pnpm storage:setup      # CORS for browser uploads, expiry of unconfirmed uploads

# 4. Run
pnpm dev                # web on http://localhost:3002, API on http://localhost:4000
pnpm dev:worker         # AI worker on http://localhost:8000 (separate terminal)
```

Open http://localhost:3002 and choose **Get started** to sign up (email, phone or, once
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set, Google), then complete onboarding.
http://localhost:3002/status shows API, database, and Redis health (admins only when `APP_ENV=production`).
Emails and SMS are not sent locally: read them (verification links, OTP codes) from the dev mailbox,
`http://localhost:4000/api/dev/mailbox?to=<email or +234…>`. To make yourself an admin after signing
up: `pnpm --filter @readi/api admin:grant -- --email you@example.com --role admin`.
Profile → **Your data and account** downloads everything we hold about you, or deletes the account
(7-day grace period, ADR-0011); support cancels a deletion with
`pnpm --filter @readi/api admin:cancel-deletion -- --email you@example.com`.
API docs (development only): http://localhost:4000/docs.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test   # TS + Python (ruff, mypy, pytest); tests need the compose services
pnpm build
pnpm check:contracts                       # drift check: Zod → Pydantic, and OpenAPI → packages/api-client
pnpm test:e2e                              # Playwright: sign-up → onboarding in a real browser at 360px
```

The first end-to-end run needs the browser: `pnpm --filter @readi/web exec playwright install chromium`
(add `--with-deps` on a fresh Ubuntu to install its system libraries). It uses its own database
(`readi_e2e`), bucket, ports (3010/4010/8010) and build folders, so it can run while `pnpm dev` is up.
Page weight on a throttled connection: `E2E_SLOW_NETWORK=1 pnpm test:e2e slow-network` (not in CI —
timings depend on the machine).

## Layout

| Path                    | What                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/web`              | Next.js candidate app and `/admin`, PWA via Serwist                   |
| `apps/api`              | NestJS API; the only service with database access (Prisma)            |
| `apps/ai-worker`        | Python/FastAPI AI worker (interviewer, evaluator); no database access |
| `packages/shared-types` | Zod contracts — the source of truth for cross-language types          |
| `packages/api-client`   | API client generated from the API's OpenAPI document (ADR-0012)       |
| `packages/ui`           | Design tokens                                                         |
| `packages/config`       | Shared tsconfig, ESLint, Prettier, Vitest preset                      |
| `infra/`                | Docker Compose for local development                                  |

## Troubleshooting

- **Port already in use:** override host ports in `infra/.env` (see `infra/.env.example`) and update the
  URLs in the apps' `.env` files.
- **`/health` reports `not_migrated`:** run `pnpm db:migrate`.
- **`ERR_PNPM_IGNORED_BUILDS` after adding a dependency:** decide whether its install script may run and
  record it under `allowBuilds` in `pnpm-workspace.yaml` (`pnpm approve-builds <pkg>` or `'!<pkg>'`).

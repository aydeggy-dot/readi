# Lessons

- `pnpm doctor` is a pnpm built-in and shadows a script of that name → the check is `pnpm prereqs`.
- pnpm 12 has no `-s` shorthand for `--silent`.
- pnpm 12 fails the install on unapproved build scripts and rewrites `allowBuilds` in `pnpm-workspace.yaml`
  with placeholders; use `pnpm approve-builds <pkg> '!<pkg>'` non-interactively, then add comments.
- Prisma's npm `latest` tag can point at a release candidate; check dist-tags before pinning.
- nestjs-zod 5.5: a DTO whose root Zod schema has `.meta({ id })` breaks `cleanupOpenApiDoc` (duplicate
  components). Keep ids on nested building blocks only. The OpenAPI integration test catches regressions.
- ioredis with `enableOfflineQueue: false` fails commands issued before the first connect completes → a
  health check right after boot reported Redis down. Keep the offline queue; bound waits with timeouts.
- Importing Zod from a module that runs in the browser (e.g. `instrumentation-client.ts`) adds ~60 KB gzip to
  every page. Validate `NEXT_PUBLIC_*` at build time instead.
- Serwist precaches every static chunk by default (1.8 MB here, incl. lazily loaded SDKs); `globPatterns: []`
  keeps only the offline page and leaves the rest to runtime caching.
- When killing background dev servers, find them by listening port (`ss -ltnp`), not `pgrep -f`, which can
  match the shell running the command.
- Turborepo 2 strict env mode silently drops undeclared env vars (NEXT_PUBLIC_* is inferred for Next.js,
  others are not). Prove config reaches a task by passing an invalid value and expecting a failure.
- sentry-sdk (Python) sends request bodies (`max_request_body_size="medium"`) and frame locals
  (`include_local_variables=True`) regardless of `send_default_pii`. The Node SDK (10.x) gates bodies on
  `sendDefaultPii`; check each SDK's defaults rather than assuming.
- Status/health UIs render error codes from the API: map them through i18n, never display them raw.
- The Nest SWC build does not copy JSON files into dist/: tests passed while the built API crashed.
  Keep runtime data in .ts modules, and smoke-test the built app (`scripts/smoke-api.sh`, in CI).
- `next start` forwards the client's X-Forwarded-For verbatim through rewrites and adds nothing; never
  trust it for rate limiting. Headers set in proxy.ts do reach rewrite destinations (ADR-0009).
- Next.js rewrite destinations are resolved at build time (API_INTERNAL_URL must be set for `next build`).
- Better Auth `input: false` fields: ones with a default are silently ignored, others rejected (400).

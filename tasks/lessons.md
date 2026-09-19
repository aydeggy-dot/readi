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
- When killing background dev servers, find them by listening port (`ss -ltnp`), not `pgrep -f`/`pkill -f`,
  which can match (and kill) the shell running the command. Repeated in M1 phase 2 with `pkill -f`: never
  use `-f` pattern kills here, even for "obviously unique" command lines.
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
- Zod 4 writes a bare `z.string().nullable()` as `type: ["string","null"]`; @nestjs/swagger turns that into
  an array of strings in the OpenAPI document. Found when the generated api-client failed type-checking;
  constrained fields (format/pattern) emit `anyOf` and are fine. Guarded by a shared-types test.
- A second web instance for manual testing needs `API_INTERNAL_URL` at BOTH build (rewrite) and runtime
  (server components), and must not inherit the API's env (`env -i`), or it silently talks to another API.
- Next's route announcer repeats the page's h1 text: locate headings by role in browser checks.
- apps/api compiles tests as CommonJS: `import.meta` fails `tsc` even though Vitest runs it. After the
  LAST edit of a phase, re-run the full lint + typecheck, not just the test that changed (a clean-clone
  rehearsal caught this one).
- Anthropic SDK `messages.parse(output_format=Model)` raises a validation error on truncated or refused
  output before `stop_reason` is readable; use `messages.create` with `output_config.format` from
  `anthropic.transform_schema(Model)` and check `stop_reason` first. Found with a mocked httpx2 transport.
- Zod `z.uuid()` / `z.iso.datetime()` export `format` AND `pattern`; datamodel-codegen maps the format to
  `UUID`/`datetime`, and Pydantic cannot apply `pattern` to those (TypeError at validation). The JSON
  Schema export drops patterns that duplicate a typed format.
- SeaweedFS 4.44 enforces signed `content-length`/`content-type` on presigned PUTs and bucket CORS; the
  AWS SDK v3 default checksums must be off (`WHEN_REQUIRED`) for presigned browser uploads.
- Nest: a queue that needs a service which needs the queue is a DI cycle; split the job processor out.
- Walkthroughs catch UX dead ends unit tests miss (manual CV entry had no way to upload another file).
- Don't give the owner third-party console steps (menus, buttons) from memory: check the provider's
  current docs first and link the exact page. (Anthropic Console: I sent them to a Workspaces page
  they couldn't find; the real fix was on the API keys page.)
- The owner's `pnpm dev` API can silently stop reloading (Nest watcher alive, app never restarted; 18:01
  to 21:20 on 2026-09-19) while Next keeps hot-reloading, so the web expects fields the old API lacks.
  Likely cause: my `pnpm build` in the working tree recreated `apps/api/dist` under the watcher
  (`deleteOutDir`). Run full builds in a separate clone while the owner's dev servers run, and before
  handing over, compare the port-4000 process start time with the last API change.

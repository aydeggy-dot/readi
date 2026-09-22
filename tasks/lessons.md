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
- The Playwright MCP server (`@playwright/mcp`) defaults to the Google Chrome channel, which isn't
  installed here. A project-local entry with `--browser chromium --executable-path` pointing at the
  Playwright Chromium in `~/.cache/ms-playwright` works; skills and MCP servers added mid-session only
  load after a restart (`claude --continue`) or `/mcp` reconnect.
- pnpm 12 forwards the `--` separator to the script, so `pnpm … admin:grant -- --email x` reaches Node as
  `-- --email x` and `parseArgs` treats everything after it as positional (ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL).
  CLIs strip a leading `--` (`cliArgs()`); documented invocations are only as good as their last run.
- `nest build` honours `deleteOutDir`, so a CLI script that builds before running (`admin:grant`,
  `storage:setup`) wipes `apps/api/dist` under the owner's `nest start --watch`. Build CLIs into their own
  outDir (`nest build -p tsconfig.cli.json` → `dist-cli/`).
- Adding API code that imports a NEW shared-types contract restarts the owner's dev API before
  `packages/shared-types/dist` has it, and the app dies at startup (`createZodDto(undefined)`). Build
  shared-types first, then write the API code.
- Better Auth: a `databaseHooks.session.create.before` hook that throws `APIError.from(...)` with a `code`
  blocks every sign-in method at one point; the OAuth callback turns that code into `?error=<CODE>` on the
  error URL (appended, so the login page may see several `error` values).
- Better Auth plugins register every endpoint they own, not just the ones you configure. The
  phone-number plugin ships password-reset and password sign-in routes that were live and dangerous
  here (a reset code is stored for any number even when no sender is configured). List the routes a
  plugin adds and disable the ones the product does not offer (`disabledPaths`), with a test.
- `sendDefaultPii: false` does not stop the Sentry JavaScript SDKs sending request bodies: the HTTP
  integration buffers 10 KB of every incoming body (`maxIncomingRequestBodySize`) and
  requestDataIntegration attaches it regardless. The Python SDK has the same shape with different
  option names. Read the installed SDK rather than trusting the flag's name — this is the second
  time this exact assumption was wrong in this repo.
- A build that works locally can still fail on a fresh checkout: running package scripts directly
  (`pnpm --filter x build`) skips the turbo task graph, so generated code (the Prisma client) and
  workspace dependencies are missing in CI. Run anything CI runs through turbo, and rehearse it with
  the generated files deleted.
- Subagent reviews are worth their cost when each gets one dimension, is told to mark findings
  CONFIRMED or SUSPECTED, and every finding is re-verified in the source before acting: of ~30
  findings across five reviewers, two were blockers, several were wrong about severity, and the
  confirmations that mattered were the ones two reviewers reached independently.
- A page-weight figure belongs to a commit, not to a milestone. M1's 145 KB / 188 KB were measured
  one commit before the review fixes landed and then written into the handover by the very commit
  that invalidated them, so D1's first honest measurement looked like a 24 KB regression. Rebuilding
  the old commit in a throwaway worktree (`git worktree add`, `pnpm install` is seconds because the
  store is shared) settles this kind of question in minutes — do that before theorising about
  environments. Record the commit next to the number.
- Next's `<Link>` prefetches (`?_rsc=…`) land after `load`, so they are outside the Slow 4G figure
  but inside a naive `performance.getEntriesByType("resource")` dump taken later. Compare like with
  like, or the two numbers disagree by a few KB for no reason.
- Build the CMS against real content, not empty tables (owner, M2 planning). The plan had the admin
  UI before the seed importer; the owner swapped them so the screens are designed and reviewed with
  real tracks, lessons and rubrics in them, and so the drafted content reaches expert reviewers a
  phase earlier. Default to ordering a milestone's phases by "what makes the next phase's work
  reviewable", not by dependency order alone.
- A product invariant needs a test that cannot be satisfied by the types (owner, M2 planning).
  Separate admin and candidate schemas express "candidates never see the answer key" but do not
  enforce it — one `.extend()` undoes it. The enforcement is a test that greps the **raw serialized
  JSON** of every candidate endpoint for sentinel strings planted in the rubric, and derives its
  endpoint list from the OpenAPI document so a new endpoint is covered the day it is added. Ask of
  any rule that matters: what would fail if someone widened the type later?
- A safety-net test must be shown to fail (owner, M2 phase 2). Sentinels and an OpenAPI-derived
  endpoint list are not enough: the fixture has to contain a _real_ answer key, the test has to
  prove it is really there (the admin API returns it), and a negative control has to run the same
  detector over a payload that does leak. Then verify by hand once — widen the candidate schema,
  watch the test fail, revert — and record in the spec what was done and when. Written for a leak
  test; true of every invariant test.
- After `pnpm add` in a workspace, run `pnpm install` before trusting a typecheck (M2 phase 4). The
  incremental install left `apps/web` resolving a second copy of `@types/react`, and the failure
  surfaced as a nonsense error in an untouched component (`TextLink` props "not assignable to
  IntrinsicAttributes"). A full install fixed it. A duplicated `@types/*` is the usual cause of a
  type error in code nobody edited — check for two versions before debugging the component.
- **After every `prisma migrate dev`, read the generated SQL and delete any `DROP INDEX
questions_embedding_hnsw` before applying it.** Prisma cannot see an index on an `Unsupported`
  column, so it proposes dropping the HNSW index in migrations that have nothing to do with
  `questions` — it did so in `content_seed_managed`, `content_review_state` and again in M2.5's
  `catalogue_roles_levels_stacks`, which only adds three tables. If it ships, near-duplicate search
  becomes a sequential scan and **nothing fails**: the search still returns the right answers, just
  slower as the bank grows. `content-schema.int.spec.ts` is the only thing that notices, and it is
  the reason that test exists — verified on 2026-09-22 by dropping the index in `readi_test` and
  watching that one test fail. Use `--create-only`, edit, then apply. The rule generalises to any
  index, constraint or trigger Prisma does not model.
- Generated types reach the web app through a **built** workspace package (M2 phase 5). After
  `pnpm gen:contracts`, `packages/api-client/src/generated/schema.ts` is current but `dist` is not,
  so `apps/web` typechecks against the old shapes and the errors read as if the contract change
  never happened. Build the package (or run the turbo task that does) before believing a typecheck.
- `data-*` attributes type-check on any component and then vanish (M2 phase 5). TypeScript skips
  excess-property checks for hyphenated JSX attributes, so `<Alert data-testid="x">` compiles even
  though `Alert` does not spread its props — and the test id is simply not in the DOM. Put a test id
  on an element, or on a component that spreads, and check it renders once.
- Page weight must be measured in a **cold** browser context (M2 phase 5). Measuring the CMS in the
  context that had just signed up reported 801 KB for a 274 KB page: `encodedBodySize` counts
  resources served from the browser cache, and the load time (667 ms on a 1.6 Mbps profile) was the
  tell — 800 KB cannot arrive in 667 ms. When a weight and a duration disagree, the weight is wrong.

## A test that changes two things at once proves neither (M2 phase 6, 2026-09-22)

I added a column the seed importer sets from each file's `author`, documented in four places that
`author: human` clears it, and wrote a test that passed. The test changed the prompt **and** the
author in the same import, so it only ever exercised the path where the content had changed — which
is the path that already worked. The case the feature exists for (an expert approves a bank without
rewriting a word) did nothing at all, and two independent reviewers found it within minutes.

**The rule:** when a test sets up a change, change exactly the one thing under test. If the feature
is "X causes Y", the fixture must differ from the baseline in X and nothing else. A passing test
over a confounded fixture is worse than no test, because it stops anyone looking.

**The tell:** I wrote `write("...actually do?", undefined, "human")` — two arguments moved. That
`undefined` in the middle was the signal that the helper was doing more than the test needed.

## Audit entries must record what happened, not what was true (M2 phase 6, 2026-09-22)

I recorded `acknowledged_unreviewed: true` whenever a marked item was published, with a comment
saying "only recorded when it actually mattered". In development the guard never runs, so that
logged an override nobody performed — and a later search for real overrides would have found noise.
The condition has to include the flag the admin actually sent.

**The rule:** an audit field names an _act_, so its condition must include the act. "This was true
at the time" and "someone did this" are different claims, and only the second belongs in an audit
log.

## Read a precondition inside the transaction that depends on it (M2 phase 6, 2026-09-22)

`transition` and `markReviewed` both read the row's state outside the transaction and then updated
by id. Two concurrent requests both passed the check, both wrote, and the loser collided on the
version history's unique key — surfacing as `track_already_published` for a _question_, and as an
uncoded 500 for a review. The database was never corrupted; the error was just a lie.

**The rule:** if a check decides whether a write is legal, put it in the write's `WHERE` and treat
`count === 0` as the conflict. `account-deletion.service.ts` already did this — the pattern was in
the codebase and I did not go looking for it.

## A dropped column takes its indexes with it, and Prisma proposes nothing (M2.5 phase 3, 2026-09-22)

CLAUDE.md already warned that Prisma proposes `DROP INDEX questions_embedding_hnsw` in migrations
that never touch `questions`, because it cannot see an index over an `Unsupported` column. The
catalogue switch found the other half of that rule, and it is the more dangerous half.

`tracks_one_published_per_role_level` is a **partial** unique index, which Prisma also cannot see.
It was never proposed for dropping — it did not need to be. The generated migration contained
`ALTER TABLE "tracks" DROP COLUMN "role", DROP COLUMN "level"`, and Postgres drops every index that
depends on a dropped column. "At most one published track per role and level" would have
disappeared with no `DROP INDEX` line to delete, and nothing would have failed until two published
tracks for the same audience collided in the candidate API — months later, in data.

**The rule:** reading a migration for lines that _undo_ hand-written SQL is not enough. Read it for
lines that make hand-written SQL impossible. For every `DROP COLUMN`, ask what was indexed on that
column; for every dropped table, the same. `content-schema.int.spec.ts` already asserts both indexes
exist, and it is the test that would have caught this — it earned its place twice now.

## Prisma's generated migration is a data-loss plan when a column changes type (M2.5 phase 3, 2026-09-22)

`prisma migrate dev --create-only` refused to run at all: "Added the required column `target_role_id`
to the `profiles` table without a default value. There are 2 rows in this table." The SQL it _would_
have written drops `target_role` and adds `target_role_id NOT NULL` — the enum values simply gone.

That refusal is the useful part. It means the generated file is a starting point for a conversion,
never the conversion. The shape that worked: add nullable → backfill → **verify and raise, naming
what did not map** → `SET NOT NULL` → only then drop. Each migration runs in one transaction, so the
`RAISE EXCEPTION` rolls the whole thing back and the database is untouched.

Proving the failure path mattered as much as proving the happy one: a copy of the dev database with
one catalogue row deleted aborted with `no career_roles/career_levels row for tracks.level=intern_junior`
and left `tracks.role` and both enums exactly as they were. Later the same guard fired for real on
`readi_e2e`, which had tracks and profiles from old runs but an empty catalogue — it refused rather
than inventing rows, which is precisely what it is for.

**The rule:** test a converting migration against a **copy of a database with real rows**, and test
that it refuses. The empty test database proves nothing about a conversion, because there is nothing
to convert.

## A set that travels as an array must be sorted on both sides (M2.5 phase 3, 2026-09-22)

`questionContent` reads a question's roles back from the join tables sorted by slug. The seed file
lists them in whatever order a person typed. `sameContent(questionContent(current), input)` compared
`["backend","frontend","qa"]` with `["frontend","backend","qa"]`, found a difference, and wrote a
version snapshot — so `pnpm db:seed` twice was no longer idempotent, for exactly the two questions
whose roles were not already in alphabetical order.

`content-seed.int.spec.ts` caught it by importing the real corpus twice and asserting `updated: 0`.
That test exists because idempotency is the importer's whole promise, and it is worth more than the
unit tests around it: it failed on real content, in the one shape a fixture would never have had.

**The rule:** when a set is stored one way and written another, canonicalise **both** sides at the
comparison, not just the one you happen to control. And note which collections are genuinely ordered
— a role's stacks _are_ their order, because that is the order a candidate sees in the picker — so
the fix is per-field judgement, not a blanket sort.

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

## Test the claim by doing the thing, not by reading the code (M2.5 phase 5, 2026-09-22)

The milestone's claim was "adding a role is content, not code". A subagent swept the whole repo for
hardcoded role slugs and came back clean, which is good evidence and not proof — a grep can only
find what it knows to look for. Adding the role for real found two things the sweep could not:

- the seed importer refuses to rewrite **published** rows, so three of the eleven questions being
  tagged were left alone and named, and the tagging needed `--force` or the CMS. That is the rule
  working, but it is a step nobody had written down in the acceptance criterion;
- the generated expert-review pages never printed which **roles** a question is for, which only
  mattered once `REVIEW.md` started asking reviewers to confirm them.

**The rule:** an acceptance criterion phrased as an absence ("no code change") is tested by
performing the action end to end and then reading `git diff`, not by searching for the thing that
should not exist. And when the walkthrough does turn up a code change, name it and say why it is not
the thing the criterion forbids — a claim with an unstated exception is worth nothing.

## A generated file that another tool reformats will churn (M2.5 phase 5, 2026-09-22)

`content:review-doc` writes `*cost*`; Prettier rewrites it to `_cost_`. Both are correct markdown,
`pnpm lint` checks neither, and the committed pages happened to be in Prettier's dialect because
somebody had run `pnpm format` after generating last time. So a regeneration produced a diff of
emphasis markers mixed in with the real change, in a file whose whole purpose is being read by a
human reviewer.

**The rule:** a generator whose output lives in the repo has to agree with whatever else formats
that repo — either emit the formatter's dialect, or make running the formatter part of the documented
command. The second is cheaper and is what `content/seed/README.md` now says.

## A guard's first job is to tell you where the rule was already being broken (M2.5 review, 2026-09-22)

The new rule — a question cannot be published unless at least one of its roles, levels and (if any)
stacks is published, because otherwise nobody can ever be offered it — broke seven tests in
`content-embeddings.int.spec.ts` the moment it landed. The spec names `frontend` and `mid` directly.
Those rows exist in the test database only because a _different_ spec, `content-seed.int.spec.ts`,
imports the real corpus, which creates them as **drafts**. So the embeddings spec had been publishing
questions that no candidate could ever have been offered, and it worked only as long as the other
spec ran first.

Two things worth keeping:

- **A test that names content it does not create is borrowing, and what it borrows can change under
  it.** Every other spec mints its own catalogue pair (`seedCataloguePair`); this one did not, and
  the cost was hidden until a rule made it visible. It mints one now.
- **When a new guard fails existing tests, read the fixtures before weakening the guard.** The
  temptation is to add an exemption. Here the failures were the guard working: seven questions in a
  fixture were in exactly the state the rule exists to prevent.

## A test that only runs when asked is a test that rots (M2.5 phase 5, 2026-09-22)

`apps/web/e2e/visual/capture.spec.ts` is skipped unless `E2E_SCREENSHOTS` is set, which is the right
call — it takes twenty minutes and writes 136 files nobody wants on every CI run. The cost showed up
the first time it was asked for in three phases: its `fillProfile` still typed into a field labelled
"Your main stack", which stopped existing in phase 4 when `Profile.stack` became `technologies`. The
run did not fail fast; it waited on a locator that would never appear and died on its own timeout,
having written nothing.

Two things to keep:

- **When a milestone renames a field, grep the skipped specs too.** `pnpm test:e2e` being green says
  nothing about the specs it skipped. The phase-4 checklist would have caught this with one
  `grep -rn "main stack" apps/web/e2e`.
- **The screens a capture cannot reach are the screens it cannot photograph.** A visual suite whose
  seeding is out of date silently narrows to whatever it can still get to — here, nothing at all,
  which at least failed loudly. A partial failure would have been worse: a "before/after" review of
  a subset nobody noticed had shrunk.

## `prisma migrate dev` after `--create-only` stops on a prompt, and the error you see is the wrong one (M3 phase 1, 2026-09-25)

CLAUDE.md says to generate with `--create-only`, edit the SQL, then apply. Applying it with a
second `prisma migrate dev` is what I did, and it hung — silently, for the rest of the session.

The reason is the hand-written HNSW index. Prisma cannot see an index over an `Unsupported`
column, so the schema and the shadow database **never** agree: every `migrate dev` diffs them,
finds an index it wants to drop, and asks `Enter a name for the new migration:`. With stdin at
`/dev/null` it waits for ever, holding `pg_advisory_lock(72707369)` the whole time. The previous
session had left exactly such a process running for **twenty hours**.

The damage is in the next run, not this one. It fails with
`P1002 … The database server was reached but timed out`, which reads like Postgres being unwell and
sends you to `docker ps` and connection settings. The lock is held by an `idle` backend whose client
died; `select * from pg_locks where locktype='advisory'` names the pid, and terminating it frees it.

**The rule:** `--create-only`, edit, then **`prisma migrate deploy`** — it applies pending
migrations without diffing, so it cannot prompt. And when a Prisma command times out talking to a
database that is plainly up, look for an advisory lock before looking at the database.

## A test that borrows catalogue rows passes only on a warm database (M3 phase 1, 2026-09-25)

`content-seed.int.spec.ts` builds a temporary seed directory whose question says
`roles: [frontend]`, `levels: [mid]` — rows no file in that directory defines. The importer resolves
them from the database, so the block passed for as long as some other spec, or some earlier run, had
imported the real corpus first. On a genuinely empty database — which is what CI creates — thirteen
tests failed with `SeedReferenceError: … names role frontend, which no seed file defines`.

This was true on `main` before M3 touched anything. I found it only because M3's schema change made
me drop `readi_test`, and a warm database had been hiding it since M2.5.

**The rule:** the M2.5 lesson ("a test that names content it does not create is borrowing") has a
second half — **drop the test database and run the suite before believing it is green.** A suite
that has only ever run against a database with history in it is a suite with an unknown number of
these. The fixture now defines its own role and level, and borrows nothing.

## A leak-test control has to widen the schema, not add a field (M3 phase 1, 2026-09-25)

To check that the widened answer-key test really covers the interview routes, I added a `debug`
field carrying the pinned snapshots to the session response — and the test passed. `ZodSerializerDto`
had stripped it before it reached the wire.

That is the serializer doing its job, and it is worth knowing it is there. But it means a negative
control of that shape proves nothing about the detector. The control that works is the mistake that
would really happen: **widen the candidate schema** — I added `planned_follow_ups` to
`CandidateSessionQuestion` and to its mapper — and then the test failed on both counts, the marker
text and the field name, exactly as the content half does.

**The rule:** to prove a leak test works, make the leak the way a careless change would make it. An
undeclared field is not that way; a wider contract is.

## One candidate per test when the endpoint is rate-limited (M3 phase 1, 2026-09-25)

`interviews.int.spec.ts` shared one signed-in candidate across the file. Starting an interview is
capped at six an hour, so the seventh `start()` in the file returned 429, the test read `.body.id`
off an error body, and the failure surfaced three tests later as a request to
`/api/interviews/undefined` — a 400 about a uuid, pointing at nothing that was wrong.

**The rule:** a spec against a rate-limited route mints a fresh principal per test, and its
helpers throw on an unexpected status rather than returning a body to be indexed into. `startOk`
now says `starting an interview failed: 429 …`, which is the sentence that would have saved the
detour.

## The sixth `DROP INDEX` was in a one-line enum migration, so the guard is a test now (M3 phase 2, 2026-09-25)

`prisma migrate dev --create-only` for `ALTER TYPE "ai_call_purpose" ADD VALUE 'coverage'` — a
migration that touches no table at all — generated this:

```sql
ALTER TYPE "ai_call_purpose" ADD VALUE 'coverage';
DROP INDEX "questions_embedding_hnsw";
```

That is the **sixth** time. CLAUDE.md has warned about it since M2, `tasks/lessons.md` has warned
about it since M2.5, and it keeps arriving because the warning asks a person to notice something in a
file they are about to apply without reading, in a migration that has nothing to do with `questions`.

`apps/api/src/prisma/migration-sql.spec.ts` now reads every committed `migration.sql` — no database,
no fixtures — and fails on a migration that drops a hand-written index, or a column such an index is
built over, without recreating it in the same file. `content-schema.int.spec.ts` stays as the backstop
in a migrated database; this one catches it a step earlier and says which file and what to delete.

**The rule:** a mistake that has been made more than twice is not a thing to remember, it is a thing
to fail the build. And a guard for a silent loss earns its place by being watched fail: both halves
were — the `DROP INDEX` line re-added, and an `ALTER TABLE "tracks" DROP COLUMN "role_id"`, which is
the M2.5 shape that Prisma proposes nothing for.

## A nullable constrained field generates a Pydantic class named after the field (M3 phase 2, 2026-09-25)

`InterviewAdvanceRequest.text` was a bare `z.string().min(1).max(8_000).nullable()`. Because a
_nullable_ constrained string cannot be an annotated `str`, datamodel-codegen hoists it into a
RootModel — and names it from the field, so it emitted `class Text(RootModel[str])`. `EmbedRequest.texts`
already generates a class called `Text`, with the same limits today by coincidence.

So two unrelated contracts shared one generated class, and would have quietly split into `Text` and
`Text1` the day `EMBEDDING_LIMITS.textMaxLength` or `INTERVIEW_LIMITS.answerMaxLength` moved — breaking
whichever module had imported the one that got renamed. Neither the registry's id check nor the
generator's `addDef` conflict check sees this: both only look at **named** `$defs`.

**The rule:** give a nullable constrained field its own `.meta({ id })` (it became `CandidateText`).
More generally, after `pnpm gen:contracts`, read the generated Python for class names the schema did
not ask for — a name invented from a field is a name two schemas can collide on.

## One field, two meanings, and the engine answered the candidate's answer (M3 phase 2, 2026-09-25)

`EngineState.pending_text` held "the thing the candidate just said". It is read in exactly one place:
`CANDIDATE_QUESTIONS`, where the engine has to hold on to their question in order to answer it. But
`take_answer` set it for every answer, so the moment a question's follow-ups were done and the engine
moved into `CANDIDATE_QUESTIONS`, it found a pending utterance — the candidate's _interview answer_ —
and answered it as though it had been a question put to the interviewer.

The transition-table tests caught it on the first run, which is the argument for writing the machine
as `(state, event, now) -> state` with no I/O in it: the failure was three lines of expected steps
rather than a strange turn in a session somebody had to read.

**The rule:** name a field for the one thing it is read as, and set it only where that thing is true.
"The last utterance" and "a question the candidate asked" are different claims, and a field that
answers both answers neither.

## A rule phrased as "never, anywhere" breaks the day something legitimately speaks it (M3 phase 3, 2026-09-25)

`content-no-answer-key.int.spec.ts` treated a question's planned follow-ups as answer key and
forbade them in every candidate response. That was exactly right until phase 3 built the route that
**asks** one: the interviewer speaks the probe, so the candidate hears it, and the leak test failed
on the fixture's own marker.

The tempting fixes are both wrong. Dropping probes from the marker list would have removed the check
that stops a probe leaking through a question's `context`, or through a question the session has not
reached — which is the leak that matters, because it tells a candidate what is coming. Adding an
exception for "the interview routes" would have exempted the surface with the most to leak.

What it became: a probe may appear inside the `text` of a turn an **interviewer has spoken**, and
nowhere else in any payload — counted, so one occurrence in the right place and one in the wrong
place still fails. The fixture now carries `plannedFollowUpMarkers` separately from
`answerKeyMarkers`, because the two obey different rules.

**The rule:** when a safety-net test fails because the product legitimately started doing the thing,
narrow the assertion to the one case that is now allowed — do not delete the assertion, and do not
exempt the route. A rule with a stated exception is still a rule; a rule with a route-shaped hole in
it is not. And the fixture is the right place for the distinction, because a marker list that means
two different things will eventually be used for the wrong one.

## Two pieces of Next can buffer a stream, and only a production build answers the question (M3 phase 3, 2026-09-25)

The interview screen reads whole-turn frames over SSE, and the browser reaches the API through
Next's `/api/*` rewrite — so every frame passes `proxy.ts` (which matches `/api/:path*`) **and** the
rewrite, and `next dev` and `next start` are different code paths. None of that is worth guessing at
after a screen has been written against it.

`scripts/sse-rewrite-proof.mjs` is the answer: a stub origin that emits five frames 300 ms apart, a
production `next start` in front of it, and a client that times each arrival. They arrived at 330,
625, 926, 1226 and 1527 ms, with no `content-length` and `transfer-encoding: chunked`. It is
committed rather than written up, because a Next upgrade could change it and a note cannot fail.

Two details cost time and are worth keeping:

- **`server.close()` waits for keep-alive connections**, so the script hung after reporting — and
  because its output was piped through `tail`, nothing was printed at all and it looked like the
  build was still running. `closeAllConnections()` first.
- **`pnpm exec next start` leaves `next-server` as a grandchild.** Killing the child leaves it
  holding the script's stdout pipe open for ever. Spawn `detached: true` and kill the process group.

**The rule:** prove a transport before building on it, with the smallest thing that can answer the
question — here a stub origin, not the real API — and commit the proof as a script. And when a
long-running script goes quiet, suspect the pipe before suspecting the work.

## A guard that outlives what it guards: the abort that stopped the interview starting (M3 phase 4, 2026-09-25)

The interview screen starts itself — a session with no turns is one nobody has started, so the first
thing it does is send `start`. The first time it ran in a browser, nothing happened: the header and
the progress strip drew, the transcript stayed empty, and the network panel said the request was
`net::ERR_ABORTED`.

Three separate refs were doing one job badly:

- `inFlight` (a boolean) said an exchange was running;
- `abort` held the controller;
- `autoStarted` (a boolean) said the start had been attempted.

React runs effects twice in development — mount, unmount, mount — so the cleanup aborted the start,
and the second mount found `autoStarted` still `true` and did nothing. Refs survive the simulated
unmount; the request did not. A screen that had cancelled its own start and would never try again.

The second half of the same bug showed up in a screenshot later: because `inFlight` and `abort` were
separate, an exchange aborted while the component stayed mounted (a Fast Refresh, an effect whose
deps changed) returned to a completion path that took `abort.current !== controller` as "somebody
else owns the screen" and returned early — leaving the composer saying "Sending…" and the spinner
turning for ever.

What it became:

- **The controller _is_ the guard.** `if (abort.current) return` refuses a second exchange, and the
  one place that clears it is the one place that aborts it. A boolean that can disagree with the
  controller will.
- **The flags come down whatever happened.** `setBusy(false)` and `setThinking(false)` run before
  the "was this still mine?" check; only _routing_ and _reporting a failure_ are skipped for a
  superseded exchange. If the component really went, React ignores the writes.
- **The start guard records which session it started**, and is cleared by the unmount cleanup — so a
  re-render cannot start the interview twice, and a remount that has just aborted the first attempt
  can.

**The rule:** when a cleanup cancels work, every flag that describes that work has to be reachable
from the cancel path. Guards and handles for one operation belong in one ref — and the test for
whether you have got it right is not "does it work", it is "does it still work after React mounts
it twice".

## The React Compiler lint rules were right about the clock and the draft (M3 phase 4, 2026-09-25)

`react-hooks/set-state-in-effect` and `react-hooks/purity` rejected three things at once: a ticking
timer implemented as `setState` in an interval, a `sessionStorage` draft copied into state on mount,
and `Date.now()` called in a render.

The temptation was to reach for an `eslint-disable` and a sentence about how a one-shot read from
storage is benign. Both are external stores, and saying so removed a real defect rather than a lint
error: the draft had been living in **two** places — React state and `sessionStorage` — kept in step
by hand, which is the shape that eventually loses somebody's answer. `useSyncExternalStore` over
storage leaves one copy, and it makes the server snapshot (`""`) the honest one, so there is nothing
for hydration to disagree about.

The clock is the same argument: one module-level interval, shared by every subscriber, with the
server's `now` passed down as the floor so the first paint of a countdown is right rather than blank.

Reading the clock in an async **server** component is fine and the rule is about client re-renders —
so it goes through a named helper (`serverNow()`, beside `todayIsoDate()`), which says what it is for
at the call site.

**The rule:** when the React Compiler rules reject a hook, ask what external system is being mirrored
before asking how to silence them. Twice out of three here the rule was pointing at a second copy of
the truth.

## A passing report is not a check (the first paid interview run, 2026-09-26)

The run produced no follow-ups and openings that asked three or four things at once. One cause, and it
was in the database, not the code: the dev database held **published** rows from before the bank was
rewritten, and the importer was correctly refusing to update them (ADR-0014 decision 5). The session
pinned three-ask prompts with an empty probe menu, and the engine did exactly the right thing with an
empty menu.

What makes this a lesson rather than an accident is that **we had been told.** The dry run before that
session printed `questions: 73 to update` and named 31 more under "left alone — published, and
candidates are reading them". It was read. It exited 0, so the run went ahead. Prose in a command that
succeeds is advisory, and advisory output loses to momentum every time.

**The rule:** anything that costs money or takes a person's time gets a **check with an exit code** in
front of it, not a report. `pnpm db:seed -- --check` is that check now. When you find yourself writing
a more strongly worded warning, write an exit code instead.

## Diagnose from the artefact, not from the last diagnosis (2026-09-26)

The note written straight after that run named a third cause: "the openings ask what the probes were
written to ask, so even with the bank repaired no follow-up will fire". It was wrong, and wrong in a
way worth remembering — it compared the **new** probes against the **stale pinned** opening. Against
the live one-ask opening the same two probes are exactly complementary.

A pinned snapshot and the file it came from look interchangeable and are not; that is the entire point
of pinning. Re-reading the database rather than the note also found the real residue — ten openings
still hanging a second ask off the first — which the earlier note had not looked for because it
believed the problem was already explained.

**The rule:** when a previous session's note explains a failure, re-derive the explanation from the
artefact before building on it. Especially where the artefact is a snapshot: ask "which copy is this,
and what was it a copy of?" before comparing it with anything.

## A lexical rule can be a floor or a ceiling, rarely both (2026-09-26)

`countAsks` in `check-bank.mjs` has counted interrogatives since the QA bank, as a floor: _enough_
things are asked for to justify the criteria. Asked to reuse it as a ceiling — the opening asks _at
most_ one thing — it was useless: it reports more than one ask for 56 of 104 openings that ask exactly
one thing, because relative pronouns ("accounts **where** money left one") and existentials ("the
check that **is there**") read as asks. Two passes at sharpening it moved 48 clean to 50.

Over-counting is harmless in a floor and fatal in a ceiling. The ceiling needed a different, narrower
signal — coordination, an explicit `and`/`or`/`then` after a comma inside a sentence that asks — which
is clean on 94 of 104 with every flag genuine. The same crude counter is still exactly right for the
runtime guard, because there it compares two near-identical texts and its false positives appear on
both sides and cancel.

**The rule:** before reusing a heuristic on the other side of an inequality, measure its false
positives against the corpus. A heuristic is not a measure of the thing; it is a measure with a bias,
and which direction the bias hurts depends on which way the comparison runs.

## A prompt rule that has never been tested is a hope (2026-09-26)

`interview_question.v1.md` said "do not narrow it, broaden it, split it in two". The paid run's four
openings gained a framing sentence and no ask, which read as the rule holding. It was not evidence:
every opening in that session already asked three or four things, so there was nothing left to add.
The case the rule exists for — a one-ask opening the model could helpfully expand — had never run.

It is an invariant now, in `calls.speak`, which is a better place for it: the failure mode is
detectable in code, the fallback to the pinned wording already existed for a model that will not
answer, and the test drives it from the model's side with a scripted client, offline and free.

**The rule:** when an instruction to a model protects something that matters, ask what would happen if
it were ignored, and whether code could notice. If code can notice, the instruction stays _and_ the
code checks. And be suspicious of evidence gathered where the failure was impossible.

## "The database matches the files" has two halves, and I only checked one (2026-09-26)

`pnpm db:seed -- --check` was written to stop a stale dev database being interviewed against. It
walked every seed file, asked the database what it held for each named slug, and reported the
differences. The second paid run was then conducted against a **cut** question: `api-error-shape` had
been removed from the backend bank the day before, its row stayed `published`, and a session selected
it, pinned its pre-retrofit two-ask opening and asked it. `--check` said "the database matches
content/seed".

It was not wrong about anything it looked at. It looked at rows the files _name_, and the whole defect
was a row they had stopped naming — invisible by construction. The importer never deletes, on purpose,
so "dropped from the files" is a state that exists and nothing was watching it.

**The rule:** a check that compares two sets has to be written in both directions, and the second one
is the one that gets forgotten because there is nothing in hand to iterate over. After writing "for
each X in the files, is the database right?", write "for each X in the database, do the files still
know about it?" — and if the answer is legitimately "sometimes no", say which cases are allowed rather
than skipping the question.

## An over-counting heuristic is fine; an asymmetric one is a bug (2026-09-26)

Yesterday's lesson said to measure a heuristic's false positives before reusing it on the other side
of an inequality, and I did. What I did not check was whether the counter treated **the same meaning
written two ways** the same, which is the only property the runtime guard actually needs: it compares
the bank's wording with the model's rephrasing of it and rejects the rephrasing if the count goes up.

Two words broke it. `whom` was not in the interrogative list, so "and for whom?" counted zero and the
model's "and who it affects" counted one. `whether` was in it, so a model writing "whether that was at
work or on your own" appeared to add an ask. Both rejections were faithful rephrasings; the guard threw
them away three times each, spoke the pinned wording, and the interview lost its transitions. Four
paid calls and two visible defects, from a vocabulary list.

**The rule:** when a heuristic is used to compare two texts rather than to judge one, the property to
test is **invariance**, not accuracy. Write the pair — the original and a faithful rewrite — as a
fixture and assert they agree. The shared vector file now has those pairs in it, labelled as
asymmetries rather than as examples.

## The model cannot remember, so stop asking it to (2026-09-26)

Twice in two runs, the same shape. The interviewer repeated its transitions, because each phrasing call
is independent and is never sent the turns before it. Then, fixed for transitions, it repeated "there's
no real company behind this" in front of every answer to a candidate's question — because the prompt
tells it to say so when it cannot answer about a real employer, and every call is the first call as far
as the model knows.

Both times the temptation was to write a better instruction ("vary your transitions", "only say this
once"). Both times the instruction is unimplementable: there is nothing in the call to vary from or to
count. The fixes were structural — the engine chooses the connective, and the disclaimer moves to the
invitation, which the state machine speaks exactly once before any answer.

**The rule:** before writing "don't repeat yourself" into a prompt, check what that call is actually
shown. If the information needed to obey is not in the call, the instruction is decoration, and the
answer is either to put the information in or to move the decision into code.

## A shared test database makes a test lie in both directions (2026-09-26, M3 phase 6)

The e2e database is created once and migrated, never dropped. The e2e interview spec interviewed for
backend/mid off the shipped bank, and its "answering incompletely earns exactly two follow-ups"
assertion passed and failed at random — because `content.spec.ts` publishes a question into that exact
pair on every run, with **no planned follow-ups**, and question selection cannot tell a fixture from
the bank. A question with no probes can never produce a follow-up.

That was the visible half. The invisible half was worse: the importer never publishes and the
catalogue setup publishes only the catalogue, so in a **fresh** e2e database no question is published
at all and no interview can start. Nothing had noticed, because those leftovers were always there. The
same leftovers were what the interview screenshots had been photographing — "A report page takes
\*\*nine seconds\*\* to load … d2571bd2", literal asterisks and a uuid fragment, presented as the
product's sample content.

**The rule:** a test that needs particular content must create it, not find it. And when a shared
fixture store is never reset, ask what the suite would do on an **empty** one — that is the question
that finds the setup step nobody wrote, and the answer is usually that some other spec has been
holding the door open.

## "Flaky test" is a diagnosis, and it needs evidence like any other (2026-09-26, M3 phase 6)

`interviews-advance.int.spec.ts` occasionally refused a plainly sequential request with
`interview_busy`. It was written up twice as a flake whose fix belonged in the test fixture. Under the
load of a whole-monorepo `pnpm test` it happened twice in one run, which was enough to look properly:
closing the SSE stream is what tells the client the exchange is over, and the lock was released on the
line _after_. Any client that sends its next request the moment the stream closes — a script, a test,
M5's agent — meets a lock the exchange has already finished with.

**The rule:** "flaky" names a symptom. Before writing it down as one, say which two things are racing
and why the product is safe. If the answer is "the test is too fast", ask what a real client that fast
would see — here it would have seen a 409 in production.

## A constant that is also a database enum is two changes, not one (2026-09-26, M4 phase 0)

Adding `transcript_review` to `CONSENT_TYPES` in `packages/shared-types` looked like editing a list.
It type-checked the web app, generated new JSON Schema and new Pydantic, updated the OpenAPI document
and the API client — and then failed `pnpm typecheck` in the API, because `ConsentRecord.type` is a
Prisma **enum** and the database had never heard of the value. The plan for the phase said "add the
type" and had not noticed there was a column behind it.

The generated migration then proposed `DROP INDEX questions_embedding_hnsw`, in a migration whose only
other line is `ALTER TYPE ... ADD VALUE`. That is the seventh time, and the first in a migration with
no relation to `questions` at all.

**The rule:** before adding a value to a shared union, grep `schema.prisma` for it. A shared constant
that is mirrored as a database enum needs its own migration, and a checklist item that says "add the
type" should say which three places it lives in — the constant, the enum, and the copy. Then read the
migration, because Prisma will try to take the index again whatever the change was about.

## The commands CLAUDE.md calls safe still build the web app (2026-09-26, M4 phase 0)

CLAUDE.md says never to run a build that writes `apps/api/dist` or `apps/web/.next` while the owner's
dev servers are up, and names `pnpm build` and `pnpm test:e2e`. It does not name `pnpm gen:contracts`
or `pnpm typecheck` — and both of them run `next build` and `nest build`, because `turbo.json` has
`gen:contracts` depending on `build` and `typecheck` depending on `gen:contracts`. Running the
documented codegen command against a live dev stack is therefore the forbidden thing under a different
name. (Nothing broke this time: all three servers still answered 200 afterwards.)

The way round it, for codegen specifically, is the CLI build: `pnpm --filter @readi/api
build:standalone` writes `dist-cli`, which is a different folder from the one `nest start --watch`
owns, and `node apps/api/dist-cli/src/cli/export-openapi.js` produces the OpenAPI document from it.
Together with the two package-level `gen:contracts` scripts, that regenerates everything
`pnpm gen:contracts` does and writes neither `dist` nor `.next`:

```bash
pnpm --filter @readi/shared-types gen:contracts     # Zod → JSON Schema
pnpm --filter @readi/ai-worker gen:contracts        # JSON Schema → Pydantic
pnpm --filter @readi/api build:standalone           # → dist-cli, not dist
node apps/api/dist-cli/src/cli/export-openapi.js packages/api-client/openapi.json
pnpm --filter @readi/api-client gen && pnpm exec prettier --write packages/api-client/openapi.json
```

**The rule:** "is it safe to run while the servers are up?" is a question about the task graph, not
about the command's name. Check `turbo.json` for a transitive `build` before trusting a command
CLAUDE.md does not warn about — and ask the owner before running anything that builds, rather than
reading the rule narrowly enough to permit it.

**Fixed the same day, on the owner's instruction that a rule people must remember is a rule that
breaks.** `turbo run typecheck --dry=json` said it in one line: `@readi/web#gen:contracts <-
@readi/web#build`. Turbo synthesises a node for a task **every** package is configured for, even one
with no such script, so the root `gen:contracts.dependsOn: ["build"]` — which exists for
`packages/shared-types` alone, whose generator imports from `dist/` — was making every package build
itself, `next build` included. The root task now says `["^gen:contracts"]` and
`packages/shared-types/turbo.json` carries the `build` dependency for the one package that needs it
(`extends: ["//"]`, as `apps/api/turbo.json` already did). `scripts/gen-api-client.sh` switched from
`build` to `build:standalone`, so the API side writes `dist-cli` — which seven CLIs already use —
instead of the `dist` that `nest start --watch` owns. `pnpm gen:contracts` and `pnpm typecheck` now
build `shared-types` and `api-client` with `tsc` and nothing else, and the footgun is gone rather than
documented. **When a lesson's rule is "remember this", check first whether the thing can be made
untrue instead.**

## A pinning test that edits after the fact proves nothing about scoring (2026-09-27, M4 phase 3)

The pinning test was extended to scoring in the obvious order: run a session, let it be scored, then
edit the question and the rubric as an admin, then assert the report has not moved. It passed. Then it
was mutated — weighting the criteria from the live `rubric_criteria` instead of the pinned snapshot —
and **it still passed**.

The reason is a correct piece of design elsewhere: an answer that already has an `answer_evaluations`
row is never re-scored, so after the edit nothing read the rubric again and the stale read never
happened. The test was asserting that a stored number stays stored, which a `SELECT` would also prove.

Fixed by editing the content **while the interview is still running** — start the session, edit the
question and invert the rubric's weights through the admin API, then let the candidate finish and the
queue score it. Both mutations then failed, and that ordering is also the real sequence: a session runs
for fifteen to thirty minutes and an expert can rework a rubric inside that window. "Pinned" has to
mean pinned at the moment of **scoring**, not at the moment of asking.

A second thing the exercise settled: with both criteria scoring alike, any weighting gives the same
number, so the fixture scores 4 on the first criterion and 0 on the second. A weights test whose
fixture is symmetric is a test of nothing.

**The rule:** watching a test fail is not a formality to perform after it passes — it is how you find
out what the test is actually asserting. Mutate the specific line you believe the test is protecting,
and if the test survives, the test is wrong before the code is.

## Two shapes of "it compiled, so it must be right" in generated Pydantic (2026-09-27, M4 phase 3)

Phase 2 found that `model_copy(update=...)` skips validation and left a bare `str` in a root-model
field. Phase 3 found the same family twice more, both in five minutes of `mypy --strict`:

- **The constructor skips it too.** `EvaluateAnswerResponse(evidence_flags=[...], prompt_versions={...})`
  is an `arg-type` error, because the generated fields are `list[EvidenceFlag]` and
  `dict[str, PromptVersions]`. The fix is the shape `interview/service.py` already used:
  `Model.model_validate({...})` with plain values and `model_dump(mode="json")` for nested models.
- **Reading one back needs `.root`.** `response.evidence_flags` is a list of root models, so
  `assert "ignore the rubric" in response.evidence_flags` fails with a message that looks like a logic
  bug (`assert 'x' in [EvidenceFlag(root='x')]`). The fixtures already had `code_of()` for exactly this;
  it now has `flags_of()` beside it.

**The rule:** in the worker, build a generated contract with `model_validate` and read a scalar field
out of one through a named helper. Both are one line, and both failures are silent or misleading.

## BullMQ refuses a colon in a custom job id (2026-09-27, M4 phase 3)

`queue.add("evaluate", job, { jobId: "evaluate:" + sessionId })` throws
`Error: Custom Id cannot contain :` from inside `Job.validateOptions`. The prefix was there for
readability and bought nothing: the session id is already unique, and namespacing is what `QUEUE_PREFIX`
is for.

The real lesson is where it surfaced. The enqueue was awaited **inside** the SSE exchange, so the throw
landed after the candidate had already been sent every frame including `done`, and Nest's exception
filter then tried to write a 500 onto an open `text/event-stream`. ADR-0016 already says nothing between
`open()` and `close()` may throw; the enqueue has moved after the stream closes, wrapped, and a failure
is logged rather than raised — a lost report, not a broken interview.

**The rule:** when ADR-0016's "nothing may throw in here" meets new work, the question is not "will this
throw?" but "what happens to the response if it does?" — and the answer is usually to do the work
outside the stream.

## A redaction pattern is not a guard (2026-09-27, M4 phase 4.5)

An `ANTHROPIC_API_KEY` was printed into a session transcript by a `grep` over an env file whose
`sed` redaction did not match the line it was meant to redact — the filter looked for `KEY` in the
_value_, and the value was a key that does not contain the word. CLAUDE.md's "never print secrets"
was being followed as far as its author could tell; what failed was a regex.

**The rule:** when a rule's enforcement depends on getting a pattern right, the rule is a wish. Guard
the step that can be checked exactly — here, opening the file — not the step that cannot, which is
redacting what came out of it. `.claude/hooks/secret-guard.mjs` is that guard, checked in, with the
failing command as its first test case, and `scripts/env-has.sh` is the one narrow hole (it answers
"is this variable set?" with `set` / `empty` / `missing` and never a value).

**Two things the exercise taught that the proposal had wrong.** Scanning _output_ and redacting it is
not buildable: `PostToolUse` runs after the output is already in the transcript and nothing in the
hook contract lets it unsee. And a guard blocks its own author within minutes — this one refused
`grep -n "\.claude\|\.env" .gitignore`, where the pattern mentions the file and the command opens
nothing. A guard that blocks ordinary work gets switched off, and then it guards nothing, so the
allow cases matter as much as the deny cases and both live in the test file.

## An idempotent job id also blocks the retry you wanted (2026-09-27, M4 phase 4)

The evaluation queue uses the session id as the BullMQ job id, so two doors closing at once enqueue
one job. BullMQ keeps completed jobs (`removeOnComplete: { count: 1000 }`) and `Queue.add` with an
existing id **silently returns the existing job** — so phase 4's whole lost-enqueue recovery was a
no-op: the report route answered "still being scored" for ever and the sweep queued into a void.

**The rule:** a custom job id is a claim about jobs _in flight_. Before re-adding one, drop a job
under that id that has already completed or failed, and leave a waiting, delayed or active one alone.
Found only because the route's own test asserted the recovery actually recovered something.

## Arithmetic that looks like a bound is not a bound (2026-09-27, M4 phase 4.5)

`EvaluationTurn.text` was capped at `questionPromptMaxLength + evidenceMaxLength` = 2,400 characters —
a plausible-looking sum of two numbers that govern neither side of a real turn. A candidate may type
`INTERVIEW_LIMITS.answerMaxLength` (8,000) and the interviewer is truncated at `speechMaxLength`
(1,200). Every session in the dev database with an answer over ~2,400 characters had a gap in its
report, including two of the three M3 paid-run transcripts, and **a thorough answer was the one kind
that could not be scored**.

**The rule:** a length limit on a contract field must be the limit of the thing it carries, named as
that constant — not a sum of two others that happens to be in the right region. And the failure was
invisible because a worker 422 is reported as `AiWorkerUnavailableError` and logged as `error.name`:
the log said "unavailable" about a worker that was up and answering. See phase 7.

## Three correct rules can compose into a wrong outcome, and no test is looking (2026-09-27, M4 phase 4.6)

The first paid evaluation cost a candidate 30 points of one answer. The engine opened a question with
127 seconds left, which cleared its 120-second reserve; the answer took 99 seconds, so at submission
there was no room for a follow-up and `probes_to_judge` correctly returned nothing; and the evaluator
then scored the whole pinned rubric, correctly, because nothing had ever told it which probes were
asked. Every one of those three is right on its own terms and each has passing tests.

**The rule:** when a value is computed by one component and consumed by another, ask what the consumer
would do if the producer had done _less_ than usual. Here the consumer's input was "the rubric" when
it should have been "the rubric, and which of it we actually asked about" — a missing fact rather than
a wrong one, which is why no assertion could fail. Unit tests cover components; the gap between two
correct components is only visible in an end-to-end run against real content, which is what the paid
run was for and why it is worth its cost.

**And the symmetry is a design smell worth naming.** The 0.85 prompting discount existed for a
candidate who _needed_ a nudge; there was nothing at all for one who was never _offered_ one. A rule
that penalises one side of a situation without saying what happens on the other side is half a rule.

## A required field on a stored artefact invalidates every stored artefact (2026-09-27, M4 phase 4.6)

`not_assessed` became a required field on `SessionReportResponse`, so every `session_reports.summary`
written before it stopped parsing. That was _fine_ — the route reads with `safeParse`, answers
`report_not_ready`, re-queues, and re-assembly makes no model call because every answer already has a
row — but it was fine by luck of a decision taken for another reason, not by design of this change.

**The rule:** before adding a required field to a schema that is read back out of a database, find the
read and check what it does with the old shape. If the answer is "500s a candidate's page", the field
wants a default; if the answer is a free recovery, say so in the commit rather than discovering it.
The cheap check is to `safeParse` a hand-written old payload — it takes a minute and it is the only
evidence.

## Calibrate an estimate on the part that does not vary (2026-09-27, M4 phase 4.6)

Estimating the evaluator's cacheable prefix, the first attempt divided a rendered prompt's characters
by the paid run's measured tokens per call to get chars-per-token. It returned 2.58, which is far
outside any plausible range for English — because the reconstruction's transcript was ~1,000
characters and the real answers were several times that. The ratio was measuring the difference
between two prompts, not a tokenizer.

**The rule:** calibrate on the fixed part and let the variable part be the unknown, never the other
way round. The usable estimate came from the system prompt's own character count and a stated
chars-per-token band, with the sensitivity printed (3.5 / 3.7 / 4.0 → 12.9% / 12.2% / 11.2%) so the
decision could be seen not to turn on the guess.

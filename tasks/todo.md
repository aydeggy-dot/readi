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
- [x] Phase 3 — CV pipeline (bucket CORS, presign/confirm, BullMQ, worker /cv/parse, ai_call_log, compare script)
  - [x] Contracts: ParsedCv, CV status/upload API, cross-language CvParseRequest/Response + AiCallRecord
  - [x] Worker: service-token auth, text extraction (limits; scanned → unreadable), LLMClient (Anthropic +
        fake), versioned prompt with CV text as data, pricing config, /cv/parse, injection tests
  - [x] Worker: `compare_cv_parse` script (models side by side on a local folder; output gitignored)
  - [x] API: S3 storage (presigned PUT with signed type+length, quarantine prefix, sniff on confirm),
        `storage:setup` (bucket, CORS, lifecycle), BullMQ job → worker, ai_call_log, CV endpoints, tests
  - [x] CI: SeaweedFS for API tests
  - [x] Web: CV onboarding step (skippable, upload progress, parse polling via TanStack Query), review/edit
  - [x] Docs: ADR-0010, env examples, CLAUDE.md, README; 360px + Slow 4G check
  - Owner key in apps/ai-worker/.env (2026-09-19; the key must be scoped to one workspace, or requests
    400 asking for `anthropic-workspace-id`). Real API checked on synthetic CVs: both models parse PDF
    and DOCX, ignore an injected instruction, output no contact details. Sonnet 5 ≈ $0.006/CV, Haiku
    4.5 ≈ $0.002/CV; Sonnet's gaps were more relevant (Haiku flagged "no version control" with Git listed).
  - Pending owner: run `compare_cv_parse` on real CVs and decide the default model (sonnet-5 for now).
- [x] Phase 4 — export + deletion (ADR-0011): JSON export with a 15-minute CV link; deletion with a typed
      confirmation and a sign-in in the last 15 minutes; soft delete → 7-day grace (every sign-in method
      blocked with `ACCOUNT_DELETION_PENDING`) → hourly erasure sweep with tombstoned `audit_logs` /
      `ai_call_log` rows; `admin:cancel-deletion` CLI; `/profile/account` and `/account-deleted` pages
  - Owner action: set `SUPPORT_EMAIL` (apps/api/.env) and `NEXT_PUBLIC_SUPPORT_EMAIL` (apps/web/.env.local)
    to the real support address before production; both refuse `.invalid` there.
  - Fixed on the way: `pnpm … -- --flag` reached the CLIs with a literal `--` (so `admin:grant` never
    parsed its flags), and the CLI scripts' `nest build` wiped `apps/api/dist` under a running dev server;
    CLIs now build to `dist-cli` and strip the separator.
  - Dev data: `phase4-check@example.com` (password `correct horse battery staple`) is left in the dev
    database from the walkthrough; delete it whenever you like.
- [x] Phase 5 — Playwright e2e (sign-up → onboarding, and export → deletion) + CI `e2e` job,
      `docs/privacy/subprocessors.md`, docs, 360px and Slow 4G checks, and the full M1 review
  - Review found two blockers, both fixed: Better Auth's phone password-reset routes were live
    (account takeover by guessing a code nobody was ever sent), and Sentry was configured to send
    request bodies (`sendDefaultPii: false` does not cover them in the JS SDKs).
  - Slow 4G, measured: landing 1.9 s / 145 KB, sign-up and log-in 2.5 s / 188 KB (uncompressed
    over loopback; `E2E_SLOW_NETWORK=1 pnpm test:e2e slow-network` re-measures).
  - Final verification on a clean clone: lint, typecheck, format, build, contract drift, the built-API
    smoke test and the e2e all green; 366 tests (309 TypeScript, 57 Python).
  - Handover: `docs/progress/2026-09-20-m1.md`.

## Deferred from the M1 review (each is a real finding, none is a blocker)

- [ ] M10: the whole message catalogue (~14.6 KB, ~4 KB gzip) ships to the browser on every page,
      because `t()` indexes the imported object dynamically, and on the landing page it ships
      **twice**. Precisely (verified in the built output, D1 phase 2, 2026-09-20): the two client
      entries `app/error.tsx` and `app/global-error.tsx` each call `t()`, so Turbopack inlines a
      full copy of `messages/en.json` into each one's chunk — `1dk8p1i7hcf_1.js` 23.0 KB (error)
      and `0dhsjt1ff3r4f.js` 14.3 KB (global-error), both in the landing page's script list, ~14 KB
      of the 24 KB encoded that `468a78c` added to that page. `not-found.tsx` is a **server**
      component and ships none of it — the earlier phase-0 note named the wrong second file.
      Every route's shell pulls both boundaries, so no page can sign out of it today.

      Fix options, cheapest first:

      - **Split the catalogue per area** (`messages/errors.json`, `messages/auth.json`, …) and let
        `t()` take a namespace. Each client entry then inlines its own area (<1 KB) instead of the
        whole file. Still duplicated, but the duplicate stops mattering. No build machinery.
      - **A copy module for the boundaries**: the handful of strings `error` and `global-error`
        need, exported as consts from one small module, with a Vitest that asserts they still match
        `en.json`. The fewest bytes; a second way to write copy, so CLAUDE.md §5 would have to say
        where each is allowed.
      - **Resolve `t()` at build time** for client components (an SWC/Babel transform, or codegen
        emitting one const per key), so only the strings actually used are emitted. The real fix,
        and the most machinery; worth it only if client-side copy keeps growing.
      - Ruled out: passing the strings in from a server parent. Next renders `error.tsx` and
        `global-error.tsx` itself and hands them only `{ error, reset }`, so there is no prop.

      Whichever we pick, add a per-page byte budget to `slow-network.spec.ts` to stop the drift.

- [ ] M10 or D1: no component tests in `apps/web` (no testing-library). The riskiest logic was
      extracted into tested helpers instead (`confirmsDeletion`, `apiFailure`); the rest rides on
      the e2e. Decide deliberately rather than by default.
- [ ] M10: the dev mailbox is gated on `NODE_ENV` and the console providers alone, so a staging box
      left on those settings would hand out OTPs. Add an explicit flag or bind it to loopback.
- [ ] M10: rate-limit and dev-mailbox Redis keys contain the raw phone number or email (TTL-bounded,
      never logged). Hash the identifier into the key.
- [ ] M10: no per-account sign-in throttle — limits are per IP per route, so distributed credential
      stuffing against one known account is unbounded.
- [ ] M8 (checkout, where an email becomes mandatory): a privacy notice page, linked from sign-up.
      The CV step already says in one line that an AI provider outside Nigeria reads the file.
- [ ] Small accessibility polish: radios do not carry `aria-invalid` when their group fails; every
      CV "gap" field shares one accessible name; alerts rendered in the first server response are
      not announced; no skip link.

## D1 — design system (branch `feat/d1-design-system`, from `main` at `98bb8fd`)

Decision (owner, 2026-09-19): the **Margin** direction with adjustments, recorded in ADR-0013. Mockups,
screenshots and scripts are on the reference branch `design/explorations` (commit `0b976e2`), which is
**not merged** into `main`; only tokens, fonts, licences and `trim-fonts.sh` come across.

Decisions (owner, 2026-09-20):

1. **Preload both sans weights.** `next/font` preloads per call and 400+700 must share one call to
   stay one family, so Alegreya Sans 400 _and_ 700 (36.8 KB) are preloaded; the serif and both ₦
   faces are not. A documented deviation from ADR-0013's "only Alegreya Sans 400 is preloaded".
2. **Tab bar and SVG chart move to M3.** No screen today has three destinations or a chart, so D1
   ships only what an existing screen renders. ADR-0013 still specifies both.
3. **Draft the full Margin hero** on the landing page (sample answer, two highlighted phrases, two
   mentor notes). Draft copy for the owner's review, in `messages/en.json`.
4. **Screenshots and Slow 4G run on the e2e build** (`.next-e2e`, `dist-cli`, ports 3010/4010/8010),
   never `apps/web/.next` or `apps/api/dist`.
5. **Say plainly that it is early.** Six sentences on the landing page describe features that are
   specified but not built. One honest line in the hero, above the buttons, covers them until they
   land: "Readi is being built in the open…". The copy stays a draft for the owner to edit.

### Phase 0 — baseline (done, 2026-09-20)

- [x] Branch `feat/d1-design-system` off `main`
- [x] 80 "before" screenshots (20 screens × 360/1280 × light/dark) in `.playwright-mcp/before/`
- [x] Slow 4G re-baselined on this machine at `98bb8fd`: landing **2.3 s / 169 KB**, sign-up
      **2.6 s / 202 KB**, log in **2.6 s / 202 KB**.
- [x] Explained the gap to M1's recorded 145 KB / 188 KB. It is **not** an environment difference:
      the handover's figures were measured at `4d91a5c`, one commit before `468a78c` (the M1
      review's web fixes) landed, and that commit wrote the numbers into the docs without
      re-measuring. Rebuilding `4d91a5c` in a throwaway worktree reproduces 145 KB and 188 KB
      exactly, and `98bb8fd` reproduces 169 KB and 202 KB. Nothing environmental is involved:
      no analytics key is set (`.env.local` holds only `WEB_PROXY_SECRET`), the service worker is
      identical, and the `?_rsc=` link prefetches are outside the measurement in both.
      The +24 KB on the landing page is the new `error.tsx` / `not-found.tsx` / `loading.tsx`
      boundaries and, through them, the message catalogue — see the M10 item above.
- [x] Screenshot capture kept as `apps/web/e2e/visual/capture.spec.ts` (skipped unless
      `E2E_SCREENSHOTS=<label>`), so later UI milestones get the same before/after for free
- [x] This plan

### Phase 1 — tokens, fonts, primitives (done, 2026-09-20, `61d6853`)

- [x] Replace `packages/ui/src/tokens.css` with the ADR-0013 tokens, light and dark, plus the Readi
      additions (`--heading`, `--primary-hover`, `--brand`, `--pen`, `--highlight`, `--progress`,
      `--progress-surface`, `--track`, `--frame`, `--nav*`, `--chart-1/2`) and `@theme inline`
- [x] Contrast check: Vitest in `packages/ui` asserting all 26 ADR pairs in both themes (fails on a
      missing token too); `pnpm --filter @readi/ui contrast` prints the Markdown table
- [x] Fonts: the six trimmed faces + both OFL licences into `apps/web/src/fonts/`, declared with
      `next/font/local`; `adjustFontFallback: false` everywhere plus a hand-written `size-adjust`
      fallback face _after_ the ₦ family, or ₦ silently renders in Arial and the ₦ face never loads
- [x] `tools/trim-fonts.sh` ported from the explorations branch, paths repointed
- [x] Budget test in `apps/web`: the three Latin faces ≤ 60 KB, ₦ faces `preload: false`
- [x] `font-synthesis-weight: none`; serif only for headings and mentor notes
- [x] Button `size="lg"` (48 px), `--primary-hover` instead of `hover:bg-primary/90`; 2 px `--ring`
      focus outline with 2 px offset applied once in `globals.css`; `border-input` on every field
- [x] Prove the ₦ stack: the face is fetched on a page showing ₦ and on no other page
  - The ₦ family must come **first** in each stack, not last as the plan assumed: next/font puts its
    metric-adjusted Arial fallback inside the family variable, and that fallback has no
    `unicode-range`, so a ₦ family behind it is never reached.
  - Both sans weights are preloaded (owner decision 1); the serif and both ₦ faces are not.

### Phase 2 — Margin chrome (done, 2026-09-20)

- [x] Wordmark (Alegreya 500, dotless ı + inline SVG pen tick), in two tones: `nav` (tick in
      `--nav-accent`) and `paper` (tick in `--pen`). On the landing page, the auth pages and the bar.
- [x] `AppHeader` onto the structural grey `--nav` bar; `NavLink` is now a client component that
      marks the page you are on with `aria-current="page"` and the pen underline. The section logic
      is `isCurrentPath` in `lib/navigation.ts` (unit-tested): a link owns its section, `/profile`
      is current on `/profile/edit`, and `/` only ever matches itself.
- [x] `Note`, `Highlight`, `Margined` in `components/ui/margin.tsx` (38rem column + 15rem margin at
      `lg`, notes under their paragraph below that). **Not used by any screen yet** — Phase 3 is
      where they land, so they ship here unexercised on purpose.
- [x] "Readi by DegRon" footer line: the landing page and every signed-in page (the `(app)` layout,
      which is where `/profile/account` lives). Onboarding stays free of it, as in the mockups.
- [x] Focus on the bar. The page ring (#C2410C) is **1.46:1** on the grey — invisible. Everything
      inside `data-nav-surface` now resolves `--ring` to `--nav-accent` (3.34:1), so the rule in
      `globals.css` needs no per-component help. Two new guards: a 27th contrast pair in
      `packages/ui` ("Focus ring on the navigation bar" — ADR-0013's table has 26 and never
      considered this one), and an e2e step that tabs to the wordmark and asserts the computed
      outline is `rgb(251, 146, 60)`.
- [x] Button gains a `nav` variant for the bar; `SignOutButton` uses it (`ghost`'s `--heading` text
      would have been near-invisible there).
- [x] Slow 4G after Phase 2: landing **227 KB / 2.7 s**, sign-up and log in **260 KB / 2.9 s**
      (Phase 0 baseline 169/202 KB, plus 55.8 KB of fonts from Phase 1; the chrome itself is ~1 KB,
      the wordmark being inline SVG and the nav link the only new client component). The landing
      page's ceiling for the Phase 3 hero is **250 KB**: past it, ask the owner rather than widen it.
- [x] 80 screenshots in `screenshots/phase2/`, reviewed against `screenshots/before/`.

### Phase 3 — restyle every screen (done, 2026-09-20)

- [x] Public/auth: `/`, `/signup`, `/login`, `/phone`, `/forgot-password`, `/reset-password`,
      `/account-deleted`. The auth pages now sit under the same grey bar as the app (`PublicHeader`)
      and use `AuthCard`, which is a `Margined` grid: the form in the reading column, and an
      optional note in the margin. Only sign-up has notes — two, both true of the app today.
- [x] Onboarding: the step indicator is the mockup's named list (`Step 2 of 3` over "Your goals ·
      Your CV · Privacy choices", the current one underlined in the pen and carrying
      `aria-current="step"`) instead of three anonymous bars
- [x] App: `/home`, `/profile`, `/profile/edit`, `/profile/cv`, `/profile/consent`,
      `/profile/account`. The profile's four boxes became ruled sections — a heading on a
      `--frame` rule with rows divided by the light `--border` — which is the editorial reading of
      the same information. The one framed panel left on a page is the thing you are meant to act
      on (home's diagnostic card, the delete-account block).
- [x] Other: `/admin`, `/status` (now has the public bar), `~offline`, `error`, `not-found`, both
      `loading` files (the spinner is a pen mark). **`global-error` no longer imports anything
      visual**: it renders its own document, so it now carries its own inline CSS with the palette
      written out in both themes and the system type stack. If the tokens, `globals.css` or the
      fonts are what broke, it still renders.
- [x] The Margin hero, with the annotated example answer. Order at 360px: headline, lead, **the
      example**, then the buttons — the demonstration comes before the call to action. At `lg` the
      example moves alongside and spans both rows. The highlighter sweep lives in `globals.css`,
      keyed to `data-sweep`, inside `@media (prefers-reduced-motion: no-preference)`; the
      screenshot run (reduced motion) catches the settled state.
- [x] E2E stays green, assertions untouched: 3 specs pass, plus the capture and Slow 4G runs.
- [x] Type scale swept: secondary text is `text-base` everywhere (`text-sm` was 14px against a 17px
      body), `font-medium` became `font-bold` (the sans ships 400 and 700 only, so `medium` was
      rendering as 400), and headings dropped `tracking-tight`, which fought the serif.
- [x] Landing copy is a **draft for the owner**: `docs/progress/2026-09-20-d1-landing-copy.md` has
      the whole text, the spec line each claim rests on, and the one open question — several
      sentences describe features that are specified but not built yet (voice, the diagnostic,
      reports, study plan), with three options for how to handle that before the page goes public.
- [x] Slow 4G after the hero: landing **232 KB / 2.7 s** (Phase 2: 227 KB), sign-up **265 KB**,
      log in **264 KB**. The hero cost ~5 KB and the landing page is **18 KB under the 250 KB line**.
      Nothing new is loaded for it: the example is text, the tick and the sweep are inline SVG and
      CSS, and "naira" is spelled out so the ₦ face is still never fetched.

### Phase 4 — verification and docs (done, 2026-09-20)

- [x] The "built in the open" line in the hero (owner decision 5), above the buttons, and the
      decision recorded in the copy draft
- [x] 80 "after" screenshots in `screenshots/after/`, reviewed screen by screen against
      `screenshots/before/`
- [x] Slow 4G against the Phase 0 baseline: landing **169 → 232 KB**, sign-up **202 → 265 KB**,
      log in **202 → 264 KB**. 55.8 KB of that is the fonts; ~7 KB is the whole chrome and hero.
      The landing page sits **18 KB under** the owner's 250 KB line.
- [x] `pnpm lint`, `typecheck`, `format:check`, `test` (433: 376 TypeScript + 57 Python), `build`,
      `check:contracts`, `test:e2e` — all green
- [x] Docs: CLAUDE.md §6 conventions, README (a Design section and the commands), `packages/ui`
      description, this file, `docs/progress/2026-09-20-d1.md` and the landing copy draft.
      No `subprocessors.md` change — the fonts are self-hosted, and nothing new processes data.
- [x] The handover carries a **"before the landing page goes public"** checklist: the draft copy,
      the six future-tense claims and the line that covers them, no hardcoded prices, the real
      support email, removing the `/status` link (N4), the missing legal pages, the example answer
      being an illustration, and M10's icons and Lighthouse pass.

## M2 — content model, admin CMS, seed content (branch `feat/m2-content`, from `main` at `c5f6814`)

Plan approved by the owner (2026-09-20) with two changes: the seed importer and drafted content come
**before** the admin UI, so the CMS is built against real content; and decision 3 gets a leak test
over raw JSON, not just separate schemas. Plan: `~/.claude/plans/twinkly-twirling-kay.md`.

Decisions (recorded in ADR-0014 in phase 6): status lives on the publishable units (Track, Lesson,
Question, Rubric) and a Module inherits its track's; version history is one `content_versions` table
of JSONB snapshots; **candidate payloads never carry the answer key**; authorship columns are plain
uuids with no foreign key and are tombstoned on erasure; admin gets its own route group with a wider
column; `EMBEDDING_PROVIDER=fake` until the Voyage key arrives; markdown preview renders lazily in
the browser.

### Phase 1 — contracts, schema, migration (done, 2026-09-20)

- [x] `packages/shared-types`: content constants, `contracts/content.ts` with **separate admin and
      candidate shapes** (the candidate ones have no rubric, criteria, level descriptors or ideal
      points at all), and a test that proves it plus the rubric weight rule
- [x] Prisma: `Topic`, `Track`, `TrackTopic(is_core)`, `Module`, `Lesson`, `Rubric`,
      `RubricCriterion`, `Question`, `ContentFlag`, `ContentVersion`, and the `content_status` /
      `question_type` / `content_entity_type` / flag enums
- [x] Migration `content_model`, hand-edited below the generated SQL for the two things Prisma
      cannot express: the HNSW cosine index on `questions.embedding`, and a **partial unique index**
      giving at most one published track per (role, level) — so the candidate API always finds one
- [x] Erasure: the five authorship columns are tombstoned (ADR-0011), and the schema test that
      catches unlisted user references now also looks at columns ending in `_by`, not only
      `%user_id` — the previous pattern would have missed a `created_by`
- [x] `content-schema.int.spec.ts` proves the vector column, the HNSW index, the one-published-track
      rule and the version uniqueness against the real database
- [x] Checks: lint, typecheck, format, `check:contracts`, and 460 tests (403 TypeScript + 57 Python)
- Note: `EMBEDDING_DIMENSIONS` lives in shared-types and the migration hard-codes `vector(1024)`;
  phase 3 adds the startup check that the worker's configured dimension matches.

### Phase 2 — content service and APIs (done, 2026-09-20)

- [x] `apps/api/src/content/`: `content-workflow.ts` (pure guard, who may move what where),
      `content-cursor.ts` (the API's first keyset paging), `content-diff.ts` (a snapshot only when
      the content changed), `content.mappers.ts` (admin and candidate shapes built separately),
      `content.service.ts`, `content-admin.controller.ts`, `content.controller.ts`
- [x] Contracts: admin list query + row shapes, `TopicsResponse`, `CandidateTrackQuery` /
      `CandidatePracticeQuery`, `ContentEntityPath`, `ContentTransitionResponse`
- [x] Admin API under `/api/admin/content/*` — topics, tracks, modules, lessons, rubrics, questions,
      plus one generic transition route and two version routes for all four publishable entities
- [x] Candidate API under `/api/content/*` — `track?role&level` (falls back to the profile),
      `lessons/{slug}`, `practice?topic&limit`
- [x] Publish guards: rubric weights total 100, a question's rubric published first, a track has at
      least one module, one published track per (role, level) — the last from the partial index
- [x] **The leak test** (`content-no-answer-key.int.spec.ts`): sentinels through the whole answer
      key, endpoints read from the OpenAPI document, two negative controls, and verified by hand —
      widening `CandidatePracticeItem` made it fail on both the marker and the field name
- [x] `AuditService.record` takes an optional transaction client, so a content change and its audit
      row land together
- [x] Checks: lint, typecheck, format, 516 tests (459 TypeScript + 57 Python), `pnpm gen:contracts`
- Notes for later phases:
  - A DTO root must not carry `.meta({ id })` — nestjs-zod 5.5 then emits two components with the
    same name. It cost a `gen:contracts` failure; the rule is now in CLAUDE.md §6.
  - Test files that publish a track must own a (role, level) pair: the partial unique index allows
    one published track per pair and the suite shares one database. The table is in
    `apps/api/test/content-fixtures.ts`.
  - `ContentEntityType.module` is unused for now: a module has no status or version of its own, so
    editing one versions its track (ADR-0014 decision 1). Say so in the ADR.
  - Candidate flag submission (`ContentFlagInput`, `POST /api/content/flags`) is **not** built — it
    was not in the phase's scope; it belongs with the feedback loop in M9.
  - Retiring a rubric silently hides its published questions from practice. Correct, but the CMS
    should warn: phase 5.

### Phase 3 — embeddings (done, 2026-09-21)

- [x] Worker `readi_worker/embeddings/`: `base.py` (Protocol, frozen result, `EmbeddingError` with
      latency), `fake.py` (hash-seeded unit vector + a scripted provider for error cases),
      `voyage.py` (REST via httpx2, retries 408/429/5xx, orders vectors by `index`, refuses a
      vector of the wrong length), `service.py`, `router.py`
- [x] `POST /embeddings` behind the service token; a provider failure is a 200 with
      `status: "failed"` so the API still records what the call cost (as `/cv/parse` does)
- [x] Settings: `EMBEDDING_PROVIDER` (default `fake`), `VOYAGE_API_KEY`, `EMBEDDING_MODEL`,
      `EMBEDDING_DIMENSIONS`, `EMBEDDING_TIMEOUT_S`; voyage without a key and fake in production
      both fail at startup. `.env.example` documented
- [x] Contracts `EmbedRequest` / `EmbedResponse` registered, so the Pydantic models are generated
- [x] API: `question-embeddings.repository.ts` is the only raw vector SQL (store, clear, cosine
      search, stale rows); `question-embeddings.service.ts` embeds, records the `ai_call_log` row
      and never throws; publishing a question returns `duplicates`;
      `POST /admin/content/questions/duplicate-check` warns while a question is still being typed
- [x] A published question whose wording changes is re-embedded; a failure clears the vector rather
      than leave a stale one
- [x] `pnpm --filter @readi/api content:reembed` (probes the worker for the current model,
      `--dry-run`, `--limit`, `--model`)
- [x] Checks: 552 tests (476 TypeScript + 76 Python), lint, typecheck, format, contracts
- [x] Verified against a real worker over HTTP (fake provider): `/embeddings` returned a 1024-dim
      vector and a zero-cost `ai_call` record, and `content:reembed` found one stale question,
      embedded it, and reported `0 to (re-)embed` on the next run
- **Switchover when the Voyage key arrives: `docs/runbooks/embeddings-switchover.md`** — which env
  vars to set, how to verify one real call (including that the model name in ADR-0006 still
  exists), and when to run `content:reembed`. The Voyage price in `pricing.py` is an unverified
  estimate; step 2 of the runbook says to confirm it.
- Notes: `httpx2` became a direct worker dependency (it was already present under the Anthropic
  SDK). The contract generator wraps length-constrained strings in a RootModel, so the worker
  unwraps `request.texts[i].root` — a comment says what to delete if that ever changes.

### Phase 4 — seed format, importer, drafted content (done, 2026-09-21)

- [x] `contracts/seed.ts`: the YAML format — slug references rather than uuids, `status: draft` as
      the only status a file may declare, `author`, and a **required `reviewer_notes` per
      question** (owner's ask: make review easy)
- [x] `seed-loader.ts`: `yaml`'s `parseDocument` + a `LineCounter`, so every complaint carries
      file, line, column and the path in the file's own words — and reports every problem, not the
      first. A missing key is reported against the item that is missing it
- [x] `seed-import.ts`: writes through `ContentService` as `SYSTEM_ACTOR`, so a seeded change makes
      the same version snapshot and audit row as a human edit; skips anything unchanged; never
      deletes, publishes or embeds. `--dry-run` resolves forward references to a placeholder so it
      can print the whole plan
- [x] `pnpm db:seed` (replacing the M2 placeholder) and `pnpm --filter @readi/api content:review-doc`
- [x] Content, all `status: draft` / `author: ai_draft`: 14 topics; **frontend** — 1 track, 3
      modules, 6 lessons, **8 questions** (5 technical, 1 scenario, 2 behavioural) with 6 sharp
      rubrics plus a shared behavioural one; **backend** and **qa** skeletons — 1 track, 1 module,
      2 lessons, 3 questions each
- [x] `content/seed/REVIEW.md` — the guide the experts are given (the four checks, how to send it
      back, what to know first) — and `content/seed/README.md` for engineers
- [x] `content/seed/review/{frontend,backend,qa}.md` — generated printable pages: each question with
      its answer key, all five level descriptors per criterion, the drafter's uncertainties, and a
      tick box per check. Regenerate after editing the YAML; do not hand-edit
- [x] Tests: loader unit tests (line/column, every problem, draft-only) and assertions over the real
      corpus (valid, all draft, references resolve, weights total 100, notes present); integration
      tests for create/idempotent/update-history/dry-run/bad-reference, plus **the answer-key
      detector run over the corpus we actually ship** — the leak test's second pass, moved into the
      seed spec so two files never import concurrently
- [x] Checks: 572 tests (496 TypeScript + 76 Python), lint, typecheck, format, contracts
- [x] Verified by hand: `pnpm db:seed -- --dry-run` → 14 topics, 11 rubrics, 14 questions, 3 tracks,
      5 modules, 10 lessons to create; import; second run reports everything unchanged
- Owner action: **the frontend bank needs expert review** — `content/seed/review/frontend.md` is the
  page to send. Quality over quantity was the instruction, so cuts are welcome; the questions I am
  least sure about are `js-async-ordering` (level) and `pushing-back-on-a-release` (cultural fit).
- Notes: `yaml@2.9.1` is a new API dependency. `reviewer_notes` and `author` stay in the files —
  they have no column — so if the CMS should show them, that is a migration in a later milestone.
  Two spec files that both publish a track for one (role, level) pair still conflict; the fixtures
  now clear only _published_ tracks for a pair, so the seeded drafts survive.

### Phase 5 — admin UI, and the source of truth after import (done, 2026-09-21)

Owner's ask: settle where content lives once it has been imported, record it in ADR-0014, and say
how expert feedback on `content/seed/review/*.md` comes back.

**The decision (ADR-0014 decision 5).** The seed files create; the CMS owns. Every content row
carries `seed_managed`: true while the importer is the only thing that has written its content,
false the moment a person saves a change to it in the CMS. The importer creates what is missing,
updates only rows that are still `seed_managed`, and **names** the rest in its report. `--force`
overwrites anyway and takes the row back. Two things deliberately do not take a row away from the
files: a status transition (publishing is not authorship) and a save that changed nothing. The
skipped list only names items whose file content actually differs, so it stays a list of file
changes that did not land rather than one that never empties.

**Feedback flow** (written into `content/seed/REVIEW.md` and `README.md`): the YAML until the first
expert review lands, the CMS after. Nobody has to remember which — the importer says what it left
alone, every run.

- [x] `docs/adr/0014-content-model-and-workflow.md` — decisions 1–4 from the approved plan plus
      decision 5 and the feedback loop; ADR index updated
- [x] Migration `content_seed_managed` on all six content tables, backfilling existing rows as
      seed-managed. Prisma's generated `DROP INDEX questions_embedding_hnsw` was removed by hand —
      it proposes that in **every** migration that touches `questions`
- [x] `Actor.source` / `SEED_ACTOR` in `ContentService`; the flag is written by content writes only
- [x] Importer: `skipped` slugs, `--force`, and six per-entity update paths collapsed into one
      `applyChange` helper; `pnpm db:seed` reports what it kept and how to overwrite it
- [x] `seed_managed` on the admin contracts (not `Topic` — it is the one admin shape the candidate
      responses share), so the CMS can say which items a re-import still controls
- [x] Web: route group `(admin)` at `max-w-5xl`, `requireContentEditor()`, admin bar + content
      section bar, `NavLink` gained `exact` (/admin and /admin/content are siblings, not a section)
- [x] Screens: content home with the "waiting for an admin" queue; lists with a GET filter bar,
      search and keyset paging for questions, rubrics, lessons, tracks; topics managed in place;
      create/edit forms for questions, rubrics, lessons, tracks and modules; the rubric editor with
      a live weight total; transitions; version history with snapshots; duplicate warnings
- [x] Markdown preview: `marked` 18.0.12 + `dompurify` 3.4.15, dynamically imported and sanitised.
      Verified in the build: the two chunks (27 KB + 42 KB) are in **no** route's initial JS
- [x] `CONTENT_TRANSITIONS` moved to `@readi/shared-types/constants`, so the CMS draws its buttons
      from the same table the API guard enforces instead of a second copy that would drift
- [x] e2e `apps/web/e2e/content.spec.ts`: candidate gets a 404 from the CMS; expert adds a topic,
      writes a rubric (weights 60/40, five descriptors each) and a question, previews the markdown
      and submits both; expert has no Publish button; the candidate API does not have the question;
      admin's publish is refused until the rubric is published, then succeeds; history shows the
      snapshot; the candidate sees the question and none of the answer key
- [x] `e2e/visual/capture.spec.ts`: a fourth `expert` state (seeds `/content/seed` into the e2e
      database, then grants the role) and eight CMS screens
- [x] Checks: lint, typecheck, format, `check:contracts`, build, 507 TypeScript + 76 Python tests,
      the full e2e suite
- [x] Slow 4G, measured at `8bf3fef` (`E2E_SLOW_NETWORK=1 pnpm test:e2e slow-network`, cold context,
      uncompressed over loopback): CMS question list 274 KB / 2.9 s, question form 294 KB / 1.3 s —
      in line with sign-up (275 KB). 112 screenshots in `screenshots/m2-phase5/` for review
- Deviation from the approved plan: retire/publish confirm with a second click and a sentence,
  not a typed word. Both moves are reversible (`retired → draft`), and a modal at 360px costs more
  than it protects. Say so if you would rather have the typed confirmation.
- Not built, and worth a decision later: reordering modules and lessons by drag (position is a
  number field today), and `reviewer_notes` / `author` in the CMS — they have no column, so showing
  them is a migration (noted in phase 4 too).

### Phase 6 — verification, docs, handover, and the unreviewed-draft guard

Owner's ask (2026-09-22): say plainly that seeded drafts may be published in development to build
M3 but never in production before an expert review, and make production enforce it.

**The decision (ADR-0014 decision 6).** `author: ai_draft` lived only in the YAML, so once content
was imported nothing could tell a model's draft from a vetted question. `seed_managed` is the wrong
axis — it says who owns the words, and it stays true after an expert reviews a bank in the YAML, so
a guard built on it would refuse the reviewed content and wave through a typo fix. The fact needs
its own column.

- [x] Migration `content_review_state` on tracks, lessons, questions, rubrics:
      `ai_draft_unreviewed` (bool, default false), `reviewed_by_user_id` (uuid, no FK),
      `reviewed_at` (timestamptz). Drop Prisma's proposed `DROP INDEX questions_embedding_hnsw`
      by hand, as in phase 5
- [x] `TOMBSTONED_COLUMNS` gains the four `reviewed_by_user_id` columns (ADR-0011); the schema
      test in `account.int.spec.ts` is the gate
- [x] `Actor.drafted` + `seedActor(author)` in `ContentService`; the importer passes each file's
      own `author`. A bare `SEED_ACTOR` means authorship unstated, which counts as an AI draft —
      the conservative default
- [x] **Not cleared by a content save.** A perfect draft would need a fake edit to be approved, and
      a typo fix would count as reviewing the whole question and rubric
- [x] `POST /api/admin/content/:entity/:id/reviewed` — the explicit "Mark as reviewed" action, for
      content_expert and admin. Writes a version snapshot and an audit entry with who and when;
      409 `content_not_unreviewed` when there is nothing to review, so it never churns a version
- [x] Re-import with `author: human` clears the flag; re-import of changed `ai_draft` text sets it
      again and clears a stale review
- [x] The guard in `assertPublishable`: `NODE_ENV=production` only, code
      `content_unreviewed_ai_draft`, override `acknowledge_unreviewed` on the publish transition
      (already admin-only) recorded in the audit entry. Never refuses in dev, test or e2e, so M3
      builds on seeded drafts freely
- [x] CMS: "AI draft, unreviewed" chip in the four lists and on each item, the Mark as reviewed
      button, and publish copy that explains the refusal and offers the override
- [x] ADR-0014 decision 6; `content/seed/REVIEW.md` and the handover say the rule in prose

- [x] Verification: lint, typecheck, format, `check:contracts` (no drift), `pnpm build`,
      **595 tests** (519 TypeScript + 76 Python), `pnpm test:e2e` 4 specs green, `pnpm db:seed`
      twice with nothing to do on the second run
- [x] Docs: ADR-0014 decision 6 and the index, CLAUDE.md §5, `content/seed/REVIEW.md` (the rule in
      prose for the expert reviewers), `content/seed/README.md`, `docs/progress/2026-09-22-m2.md`
- [x] Found in my own code during the review and fixed at `36dd6ff`+: the transition audit entry
      recorded `acknowledged_unreviewed: true` whenever a marked item was published, including in
      development where the guard never ran and nothing was overridden. It now requires the flag
      itself, with a regression test.

**Deviations from the proposal the owner approved.** None. The one judgement call not in the brief:
the review state is three columns rather than one boolean, because "who vouched for this and when"
is the evidence that makes the mark worth having, and `reviewed_by_user_id` is tombstoned on
erasure like the other authorship columns.

### Phase 7 — the owner's three decisions after the review (done, 2026-09-22)

- [x] **Published edits are an admin's call (ADR-0014 decision 7).** `assertMayEdit` in
      `ContentService` refuses a content expert changing the content of a published track, lesson,
      rubric or question — and of a module under a published track — with
      `content_edit_needs_admin`. A transition is not an edit; nothing unpublished changes
- [x] The CMS does not offer what it cannot do: the four editors and the module panel render
      disabled for an expert on a published item, with a sentence saying why
- [x] **The importer never rewrites published content** whatever authority it holds: it names the
      row under "left alone — published, and candidates are reading them", and `--force` is the way
      through. The test that asserted the opposite now asserts this
- [x] **M3/M4 note** in "Carried forward": a session must store the question and rubric _versions_
      it was scored against, or a later edit silently rewrites past reports
- [x] **The review flow has an e2e.** It builds its own uniquely-slugged topic, rubric and question
      in a temp directory each run and imports them — the only way to get an unreviewed AI draft,
      since anything the CMS creates was written by a person — then drives the chip, Mark as
      reviewed, both publishes, and the candidate API's answer-key check
- [x] Docs: ADR-0014 decision 7 and its consequences and alternatives, CLAUDE.md §5,
      `content/seed/README.md`, `content/seed/REVIEW.md`, the handover

## M2.5 — roles, levels and stacks become content (branch `feat/m2.5-roles`, from `main` at `833e3fa`)

Plan: `docs/plans/m2.5-roles-levels-stacks.md`, approved by the owner on 2026-09-22 with four
decisions — launch content is frontend, backend, QA and full-stack; data analyst moves to wave 2 and
cannot launch before a SQL practice surface exists; AI/LLM Engineer moves from wave 3 to wave 2,
ahead of DevOps and Mobile, with no content in this milestone; and the wave order stays marked as
argued, not measured. The catalogue is `docs/role-catalogue.md` (committed at `9ece769`).

### Phase 1 — the catalogue exists, beside the enums (done, 2026-09-22)

- [x] `packages/shared-types/src/contracts/catalogue.ts`: `CareerRole`, `CareerLevel`, `Stack`,
      their inputs, admin list items and the candidate shapes, with `CATALOGUE_LIMITS`. A role's
      `levels` and `stacks` are arrays in **display order** — the order is the content, so
      reordering earns a version, unlike a track's topics which are a set
- [x] `ContentEntityPath` gains `career-roles`, `career-levels`, `stacks`; `CONTENT_ENTITY_TYPES`
      and the Postgres enum gain `career_role`, `career_level`, `stack`
- [x] Prisma: the three entities with the full content-workflow column set, plus `CareerRoleLevel`
      and `CareerRoleStack` (the `TrackTopic` shape, with `position` and `is_default`). Migration
      `catalogue_roles_levels_stacks`, hand-edited to drop Prisma's proposed
      `DROP INDEX questions_embedding_hnsw` — verified still present afterwards
- [x] `ContentService`: CRUD, transitions, version snapshots, audit, `seed_managed` and review
      state for all three; `guardedUpdate` refactored into two switches over the now **seven**
      publishable entities rather than a nested ternary
- [x] **Publishing a role needs a published level** (`career_role_has_no_published_level`): the
      candidate catalogue shows published levels only, so otherwise a role would appear in
      onboarding with nothing to choose. Stacks are deliberately not required
- [x] **Retiring is refused while in use**: `level_in_use` / `stack_in_use` when a _published_ role
      still offers it. `role_in_use` waits for phase 3, when tracks, questions and profiles start
      pointing at roles — the code says so where the check will go
- [x] Admin routes for all three under `/api/admin/content/`, and the candidate read
      `GET /api/content/career-roles` (published roles, each with its published levels and stacks)
- [x] `content/seed/levels.yaml`, `stacks.yaml`, `roles.yaml`; the importer creates the catalogue
      **first**, resolves level and stack slugs to ids, and raises `SeedReferenceError` naming the
      file for a slug nothing defines
- [x] Erasure: six new authorship columns in `TOMBSTONED_COLUMNS` and in `eraseUser` (ADR-0011)
- [x] Tests: `catalogue.test.ts` (shared-types), `content-catalogue.int.spec.ts` (14 cases), a
      catalogue corpus in `content-seed.int.spec.ts`, and the new candidate route added to the
      leak test's exercisers. Lint, typecheck, `pnpm test` (310 API tests), `pnpm test:e2e`
- [x] `pnpm db:seed` twice: 2 levels, 19 stacks, 3 roles created, then nothing

**Decisions taken in the phase, for the owner to confirm:**

- **A `Stack` is the interview _variant_, not a technology.** The plan said the seed stacks would
  come from `STACK_SUGGESTIONS` (`JavaScript`, `React`, `Postman`…), but those are one-tap
  suggestions for the free-text list of things a candidate knows. The entity M3 needs is the
  variant a question is tagged for — "Java / Spring" rather than "Java" — so `stacks.yaml` carries
  the variants from `docs/role-catalogue.md`. `stack-suggestions.ts` stays where it is for now;
  phase 4 decides whether the technologies field keeps its own suggestions.
- **The level slug is `intern-junior`, not `intern_junior`.** A slug cannot contain an underscore
  (`SLUG_PATTERN`), so phase 3's wire format for a level changes by one character. Everything that
  sends `level: intern_junior` — `profiles.ts`, the seed tracks, the e2e specs — changes with it in
  that phase; nothing does yet.
- **A candidate role's levels are `level_options`.** The leak detector treats any key containing
  `levels` as a rubric's level descriptors, which is answer key. Renaming the field was the honest
  fix; weakening the detector was not. Recorded in the contract and in a test.

### Phase 2 — the CMS for the catalogue (done, 2026-09-22)

- [x] Three new sections in `/admin/content`: **Roles**, **Levels**, **Stacks** — list, create and
      edit pages each, with the no-JavaScript filter bar, the keyset pager, and the same
      review/transition/version panels as every other entity. The nav bar is eight items now and
      still scrolls sideways at 360px
- [x] `career-role-form.tsx`: name, slug, summary, position, interview types, and the levels and
      stacks the role offers. The links are part of the role (the `TrackInput.topics` shape), not
      sub-resources, so they are saved with it
- [x] **The order a role lists its levels and stacks in is preserved on save.** `catalogue-order.ts`
      draws what the role already offers first, in its order, then the rest of the catalogue, and a
      newly ticked row joins the end — so opening a seeded role and pressing Save does not reshuffle
      the candidate's picker. Five unit tests
- [x] `catalogue-form.tsx` serves levels and stacks: they differ by one field and one endpoint, and
      two files of the same form would drift
- [x] Choices are sorted for a picker rather than for a worklist — levels by rank, stacks by name —
      because the API lists come back "most recently edited first" (`catalogue-choices.ts`)
- [x] The six new refusal codes are mapped to copy (`content-errors.ts`); the CMS never shows the
      API's English (ADR-0012)
- [x] The `in_review` queue on the CMS home covers the catalogue too: a submitted role nobody
      publishes is the same stall as a submitted question
- [x] **At most one default stack** — a new refine on `CareerRoleInput`, because the picker starts
      in one place and two defaults would make it arbitrary. The form uses a radio group, so the
      rule is visible before the API has to enforce it. Contract test + integration test
- [x] e2e `catalogue.spec.ts`: an admin adds a level, a stack and a role, is refused the publish
      until the level is out, publishes all three, and the candidate catalogue returns the role with
      its label, level and stack — then the level cannot be retired out from under it
- [x] Checks: lint, typecheck, `pnpm test` (311 API, 116 web), `pnpm test:e2e` (6 passed)
- [x] Walked by hand at 360px in Chromium (dev servers, seeded catalogue): both lists, the role
      editor, create → submit → publish, both refusals with their copy. The dev database was put
      back afterwards — the check role deleted and `intern-junior` returned to draft; the audit log
      keeps its record, as it should

**Known limit, deliberate:** the role editor offers one page of levels and stacks (100 each, far
above the per-role limits of 8 and 20). If the catalogue ever outgrows that, the editor says so
rather than letting a save drop what it never showed — `admin.content.role.catalogueCapped`.

## Carried forward

- **M4 blocker — expert blind-scoring of transcripts needs its own consent type and privacy copy
  before any transcript is sampled.** Spec §90 commits the MVP to an "internal calibration tool:
  admins/experts blind-score sampled answers", and `docs/status-and-dependencies.md` repeats it. That
  is a staff human reading what a candidate typed, which is a processing purpose we have never named:
  `CONSENT_TYPES` has `audio_processing`, `recording_storage`, `camera_coaching` and `marketing`, and
  none of them covers it. It surfaced on 2026-09-26 while rewriting `interview_intro` — the intro had
  been telling candidates "nobody else is listening", which the calibration tool makes false the day
  it ships (item 13 of the paid-run diagnosis). **Nothing may sample a transcript until three things
  exist:** a consent type (or a documented lawful basis that does not need one) with its
  `CONSENT_VERSIONS` entry and `consent.types.<type>.v1` copy; an entry in the privacy copy and in
  `docs/privacy/subprocessors.md` if a third party is involved; and the calibration tool reading the
  decision before it selects a sample. The intro's v2 wording is deliberately silent about staff
  reading transcripts, because until this is decided we do not know what to promise — so the wording
  is honest today and must be re-read as part of this item, not left to drift into being a lie again.

- **M3/M4 — pin the content a session was scored against.** Every `InterviewSession` must record the
  exact **question version and rubric version** it used (and the resolved rubric criteria, or a
  reference that can reach the right `content_versions` snapshot), not just `question_id` /
  `rubric_id`. Content keeps changing after a session: an admin edits a published question, an
  expert reworks a rubric's weights, `--force` re-imports a bank. Without the version pinned, a
  candidate's past report and readiness score silently start describing a rubric nobody scored them
  against, and the `/evals` regression suite stops being reproducible. `content_versions` already
  holds the snapshot (ADR-0014 decision 2) — the session needs to name which one. Decide the shape
  when M3 designs the session bundle the worker receives, and cover it with a test that edits the
  content after a session and asserts the report does not move.

- **M5 — two model calls per answer is a text-mode budget, not a voice one.** M3 judges coverage
  and then phrases the chosen probe in two sequential calls (M3 decision, 2026-09-25): honest and
  cheap when the candidate is typing, but it doubles what voice mode has to fit under the ~1s
  turn target (CLAUDE.md §5 "Performance & low bandwidth"). Three ways out, and M5 should measure
  before choosing: **merge** them into one call that returns the coverage flags and the phrased
  probe together — the risk is that the model then effectively chooses, which is the thing the
  planned-follow-up decision exists to prevent, so it would need the engine to discard a phrasing
  for a probe it did not pick; **parallelise** by phrasing every candidate probe while the coverage
  call runs and throwing away the losers — costs tokens, not latency, and there are at most four;
  or **skip** — the phrasing call never runs when coverage says everything is covered, and the
  coverage call itself is pointless once the follow-up budget is spent, because there is nothing
  left to decide. That last one is free and belongs in M3; the first two are M5's call, with real
  latency numbers in front of it.

- **M6 — re-read the readiness formula's split before the first non-engineering role launches.**
  The formula's `technical` / `behavioral` / `communication` weighting (spec §7) assumes an engineering
  interview. The wave-2 roles do not all have that shape: an analyst is scored on metric definition and
  explaining to non-technical stakeholders, a TPM on discovery and prioritisation, support on customer
  tone. M2's rubric model already allows any dimensions per rubric, so the question is only how they
  roll up into one score — whether the three buckets are per-role weights, per-role bucket _names_, or
  a wider set. Decide it in M6, while the formula is being written and has no history behind it;
  changing the split after candidates have scores means either rescoring or a versioned discontinuity.
  Raised by `docs/role-catalogue.md` § "What this implies for the product beyond M2.5" (owner, 2026-09-22).

- M1: install Playwright with the first e2e test (email signup → onboarding). Right after Playwright is
  added to the repo, tell the owner to install Chromium's system libraries by running:
  `sudo env "PATH=$PATH" pnpm exec playwright install-deps chromium`
  (`sudo` alone cannot see pnpm, which nvm installs under the home folder). Until then, the
  `mcr.microsoft.com/playwright:v1.62.1-noble` image with `--network host` works (used for the M0 360px check).
- M10: PNG PWA icons (192/512, maskable), Lighthouse pass (landing page ships ~180 KB gzip JS today).
- M10: Sentry source-map upload (`@sentry/cli` build script is denied until then).

- **M3 — a "not listed / other" path for a candidate whose variant we do not offer.** The picker
  offers the role's variants and "Not sure yet", and "Not sure yet" means _general questions only_
  (ADR-0015). A candidate who writes Svelte, or Spring Boot when the list says "Java / Spring", has
  nowhere honest to land: choosing a variant that is not theirs buys them the wrong questions, and
  choosing nothing buys them a thinner set with no explanation of why. Decide it in M3, when question
  selection is written — whether "Other" is a third state carrying a free-text note that never touches
  eligibility, or "Not sure yet" renamed and explained on the setup screen, and what the screen tells
  the candidate they are getting either way. It is as much a content gap as a code one: the right
  answer is often "add the variant", so whatever we build should make it easy to tell us which one.

- **M7 (content), shape decided in M3 — the role-agnostic content nobody owns yet.** Two pieces apply
  to every role in the catalogue and belong to none of the banks:
  - **The candidate's own questions at the end.** M3 has a `CANDIDATE_QUESTIONS` state and the spec
    promises "lightweight feedback" there (§4.3), with nothing behind it — no rubric, no guidance, no
    lesson. Decide in M3 what that feedback is scored against; write the content with the banks.
  - **Salary negotiation.** Spec §2 names it as a mid-level switcher's need and nothing in the product
    answers it. It is a lesson track, not a question bank, and `Track` is keyed by role and level, so
    role-agnostic content has no home today: it needs either a catalogue entry that means "any role" or
    a second kind of track. Decide the shape before writing the content, not after.

- **Before M3's plan is final — should the coding round move earlier?** Spec §4.3 tags the coding
  interview (Monaco + Judge0) **[P2]** and `docs/plans/m3-interview-engine.md` leaves it out. But it is
  the round candidates most often fail for frontend, backend and full-stack — three of the four launch
  roles — and `docs/role-catalogue.md` rates all three "Most" rather than "Full" _because of it_. A
  text interviewer that never asks anyone to write code prepares two rounds out of three and should not
  pretend otherwise (product principle 1). Against moving it: a sandbox or Judge0 is infrastructure we
  do not run yet, Monaco would be the heaviest thing on a mobile-first product (lazy-loaded, but still),
  and code is not the answer shape M4's evaluator is being built around. This is a milestone re-order,
  so it is the owner's call, and it is cheaper to take before M3 plans than after M4 has assumed every
  answer is prose.

- **M7, or the question-bank pass — one-tap technology suggestions, as a content field on `Stack`.**
  M2.5 phase 4 deleted `stack-suggestions.ts`, because its suggestions were the role's _variants_ and
  the picker above the field now offers exactly those. The free-text `technologies` field ("anything
  else you know") lost its chips with it, and is bare typing on a phone. Bring them back where they
  belong: a `suggested_technologies` list on each `Stack` row — Node.js (Express / NestJS) → Express,
  NestJS, PostgreSQL, Redis, Jest — seeded from `stacks.yaml`, editable in the CMS, and drawn as tap
  targets under the field for whichever variant the candidate picked. Content, not code, so adding one
  stays a content change (ADR-0015). Natural home: `docs/plans/content-catalogue-banks.md`, which is
  already going to write the stack rows properly.

- **M10 — the landing page enumerates the roles in prose, and goes stale on every new one.**
  `messages/en.json` says "Frontend, backend, QA and full-stack" in the free-plan line and in the
  "Who it's for" paragraph, and an image caption says "a frontend mock interview". Adding full-stack
  was content everywhere except there, where it was a copy edit — which is the right trade today
  (marketing prose reads better than a generated list) but is worth revisiting before launch, when
  the catalogue is longer and the copy is the owner's. Either generate the list from the published
  catalogue, or write copy that does not enumerate ("every role we cover, from intern to mid-level").

- **Senior: the level row exists, the interview behind it does not.** `senior` (rank 30) is in
  `levels.yaml` as of M2.5 phase 5, as a **draft** that no role offers — so no candidate can choose it,
  which is the point: the row was the cheap half, and adding it now proves the catalogue claim while
  the content is still unwritten. What is left is not "write harder questions":
  - **Question types.** A senior interview turns on **system design** and on trade-offs argued out
    loud. `system_design` is not in `QUESTION_TYPES`, and the surface it needs (Excalidraw + vision
    review) is **[P2]** in spec §4.3. Until then a senior track would be missing its centre.
  - **Rubrics.** Seniority is scored on judgement, scope and influence — leading without authority,
    mentoring, saying no to work, owning an outcome past your own commits. Those are dimensions the
    junior/mid rubrics do not contain, not higher bars on the ones they do.
  - **Session length.** 15 minutes cannot hold a design discussion; senior sessions are longer, which
    touches the time budget, the question budget and the voice-minute allowance (spec §4.6).
  - **Readiness.** See the M6 item above — the `technical`/`behavioral`/`communication` split is a
    junior-to-mid engineering shape, and "leadership" does not fit in it.

  So: the level row lands in M2.5 (done), the bank and rubrics land with the question-bank pass, and
  the level is **offered by a role and published only when its content exists** — an empty level in the
  picker is worse than no level at all.

## Repository

- Done (owner, 2026-09-19): the old Windows `origin` was removed; `origin` is now the private GitHub repo
  `git@github.com:aydeggy-dot/readi.git`, with `main` and `feat/m0-scaffold` pushed. No remote action needed.
- The owner pushes; Claude commits locally and does not push unless asked.
- 2026-09-19 (M1 phase 2 start): GitHub `main` was still `80ef242` (M0 not merged there yet), so there was
  nothing to rebase; `feat/m1-auth-onboarding` stacks on the M0 commits. After M0 lands on `main`: a
  merge commit or fast-forward needs no action; after a squash merge run
  `git rebase --onto origin/main feat/m0-scaffold feat/m1-auth-onboarding`.

## M2.5 phase 3 — the switch (done 2026-09-22)

Tracks, questions and profiles moved onto the catalogue; the `target_role` and `experience_level`
Postgres enums are gone. Roles and levels are content everywhere now, and adding one is a row.

- [x] **Migration `20260922145408_catalogue_switch`, hand-written.** Prisma's own version refused to
      run ("Added the required column `target_role_id` … There are 2 rows in this table") and would
      have dropped six columns' worth of data. The shipped one adds nullable → backfills
      (`intern_junior` → `intern-junior`; role values were already the slugs) → raises, naming any
      row that did not map → `SET NOT NULL` → drops. Two indexes it had to protect: the HNSW one
      Prisma always proposes dropping, and `tracks_one_published_per_role_level`, which Prisma
      proposed nothing about because `DROP COLUMN` would have taken it silently
- [x] Tested against a **copy of the dev database with real rows** before the dev database itself,
      and the refusal path tested too (a copy with a catalogue row deleted aborted and rolled back
      leaving both enums intact). Row counts identical before and after; 20 question→role and 21
      question→level links created from the arrays
- [x] `QuestionCareerRole` / `QuestionCareerLevel` join tables; `Track.roleId/levelId`;
      `Profile.targetRoleId/targetLevelId`; `role_in_use` and a widened `level_in_use` on retire
- [x] Contracts: `TargetRole` / `ExperienceLevel` deleted, `Slug` added (`contracts/slug.ts`);
      `TARGET_ROLES` / `EXPERIENCE_LEVELS` deleted from `constants.ts`; `CONTENT_LIMITS.questionRoles`
      (6) and `questionLevels` (4) replace the old `.max(3)` / `.max(2)`, which were enum
      cardinalities wearing a limit's clothes
- [x] **`CvParseRequest` carries labels, not keys** — pulled forward from phase 4 because phase 3 is
      what deletes the enum, and the alternative was a worker looking up keys in a map that could no
      longer be complete. `ROLE_LABELS`/`LEVEL_LABELS` and `test_labels_cover_every_enum_value`
      deleted; prompt `cv_parse.v2.md` wraps both labels **as data**, because a role's name is
      written by staff in the CMS and lands in a system prompt. New test proves a label cannot close
      its own tag. `stack_label` and the stack prompt line remain phase 4's
- [x] Web: `stack-suggestions.ts` deleted (suggestions come from the role's stacks); nine
      `t(`targetRoles._`)` / `t(`levels._`)` lookups replaced by names from the API; `targetRoles`
      and `levels` namespaces removed from `en.json`; four client components take catalogue options
      as props from their server pages; `content-query.ts` validates slug _shape_ and passes unknown
      slugs through
- [x] **Test fixtures mint their own catalogue pair.** The `(role, level)` pair-ownership table is
      deleted: it existed because the enum had six pairs and four were taken. The test database is
      migrated but never seeded, so minting is also the only thing that works
- [x] **e2e gained a `setup` project** (`catalogue.setup.ts`): seeds `/content/seed` and publishes
      the catalogue over the admin API, because the importer never publishes (ADR-0014 decision 5)
      and a candidate is only offered published roles. Without it the onboarding form draws an empty
      picker
- [x] Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (311 API, 117 web, 81 shared-types, 56 ui,
      3 api-client, 76 pytest), `pnpm test:e2e` (7 passed, 5 skipped by design), `pnpm gen:contracts`,
      `pnpm db:seed` on the migrated dev database reports every item **unchanged**
- [x] `readi_e2e` was dropped and recreated: it held tracks and profiles from old runs but an empty
      catalogue, so the migration's guard refused it — correctly. Backed up first
      (`.backups/readi-e2e-*.dump`)

**Deliberately not in this phase** (phase 4): `QuestionStack`, `Profile.targetStackId`,
`Profile.stack` → `technologies`, the stack eligibility predicate, the onboarding stack picker,
`stacks:` on seeded questions, and `stack_label` on `CvParseRequest`.

## M2.5 phase 4 — the stack dimension (done 2026-09-22)

A question can now be written for a stack variant, a candidate can say which one they are
interviewing for, and the two meet in one rule that M3's question selection will reuse.

- [x] **`question-eligibility.ts`: the rule, written once.** `isOfferedToStack` (pure) and
      `stackFilter` (the Prisma fragment) sit next to each other because they are two expressions
      of one rule and the way they fail is by drifting apart —
      `question-eligibility.spec.ts` asserts the truth table over the predicate and
      `content-stacks.int.spec.ts` runs the same table against the database
- [x] **A candidate who chose no variant gets the general questions only.** The alternative —
      show them everything — means handing a Node developer Spring code because nobody said which
      they use. The onboarding picker starts on the role's default, so arriving with no stack is a
      deliberate "not sure yet". Asserted in both specs, and in CLAUDE.md §5
- [x] Migration `20260922183000_question_stacks_and_profile_stack`, **hand-written**: Prisma
      proposed `DROP COLUMN "stack", ADD COLUMN "technologies"` — a rename written as data loss,
      which would have emptied the technologies list of every onboarded candidate. Tested on a
      copy of the dev database first (2 profiles, both kept their rows); the HNSW and partial
      unique indexes checked present afterwards. `profiles.target_stack_id` FK is `RESTRICT`, not
      Prisma's default `SET NULL`: a variant a candidate chose is not cleared behind their back
- [x] Contracts: `QuestionInput.stacks` (**no `.min(1)`** — empty is the common case, and it means
      general), `QuestionListItem.stacks`, `ContentListQuery.stack`, `SeedQuestion.stacks`,
      `Profile.target_stack` + `stack` → `technologies`, `CvParseRequest.stack_label` (nullable)
- [x] API: question CRUD and version projection carry stacks; the CMS list filters by "tagged for
      this stack" (not "who would be offered it" — a different question with a different answer);
      `audience()` grew the stack M3 will read; `stack_in_use` widened from "a published role
      offers it" to published questions and candidates' profiles
- [x] Worker: `stack_label` wrapped as data in `cv_parse.v2.md` and absent when null. **v2 was
      edited rather than bumped to v3**: the plan specified one bump carrying both the labels and
      the stack line, phase 3 pulled the label half forward, and v2 has never been released
- [x] Web: the onboarding stack picker (role's default preselected, "Not sure yet" last),
      `technologies` renamed through the form, the profile page, the CMS question editor's third
      checkbox row and the stack filter, copy, `ChoiceGroup` gained a `hint`
- [x] Seed: `stacks: [react-typescript, nextjs]` on the two React questions, with
      `reviewer_notes` asking the expert whether each tag is right; `README.md` says when to tag
      and `REVIEW.md` asks it as a fifth question; the review pages show the tags
- [x] Checks: lint, typecheck, `pnpm test` (329 API, 117 web, 85 shared-types, 56 ui, 3
      api-client, 77 pytest), `pnpm test:e2e` (7 passed, 5 skipped by design), `pnpm build`,
      `pnpm db:seed` twice (2 questions updated, then nothing)
- [x] Walked by hand at 360px: the picker follows the role and re-defaults, a deliberate
      "Not sure yet" survives a reopen, the CMS shows 19 stacks with two ticked and no page
      overflow, and — on real seeded content — a React candidate is offered the two React
      questions while an Angular candidate and an undecided one are offered neither

**Decisions taken in the phase, for the owner to confirm:**

- **The plan said "`stacks:` tags on the seeded backend and QA banks", and that was the wrong
  place.** None of those six questions is stack-specific: "what would you test and how do you know
  the list is enough" is the same question on Cypress and on Selenium. The two questions that
  genuinely are specific live in the **frontend** bank — one shows JSX with `useState` and
  `useEffect`, the other is scored on lifting state and prop drilling. Those are tagged; nothing
  else is. Writing new stack-specific questions is a planned job with its own plan
  (`docs/plans/content-catalogue-banks.md`, "round two"), not something to improvise here.
- **The technologies field lost its one-tap suggestions.** They were the role's stack _variants_,
  which phase 3 used as a stand-in — "Manual / exploratory testing" is not a technology, and with
  a real variant picker directly above it the free-text field is now "anything else you know".
  It could earn suggestions back as a content field on `Stack` if the owner wants them.
- **A retired variant stays on the profile that chose it** and is shown by its slug once the
  catalogue stops carrying it — the same rule the role and the level already follow.

**Fixed on the way:** `profile-errors.ts` mapped API error _codes_ (`role_not_found`, …) that
`ProfilesService` has never raised — it answers the profile form with **field errors**, by design,
so every one of those messages was unreachable and a stale catalogue showed "check this field".
It now maps field names, and the three catalogue fields say which choice went stale.

**Dev database, left as it is deliberately:** the catalogue is published (2 levels, 19 stacks, 3
roles) and three frontend questions with their rubrics are published, because that is what the
walkthrough above needed and what `content/seed/REVIEW.md` says developer databases are for.
`p4-stack-check@example.com` (password `correct horse battery staple`) was created for it and
**demoted back to `candidate`**; it joins `phase4-check@example.com` and
`cms-catalogue-check@example.com` in the test accounts to remove at the end of the milestone.
`aydeggy5@gmail.com` keeps its admin role.

## M2.5 phase 5 — the proof, the ADR and the docs (done 2026-09-22)

The milestone's claim is "adding a role is content". Phase 5 tested that claim by adding one, and
then wrote down what the previous four phases decided.

### The acceptance proof — a fourth role, added as content

- [x] **Full-stack engineer is in the catalogue, and no code changed and no migration ran.** Four
      rows in `stacks.yaml` (React + Node, Django + React, Laravel + Vue, .NET + React — Next.js
      and Ruby on Rails are the rows frontend and backend already offer), one block in `roles.yaml`
      with its two levels and six variants, `pnpm db:seed`, then an admin publishing the stacks and
      the role in `/admin/content` at 360px. `git diff` over `apps/` for the role itself: nothing
- [x] **Eleven of the fourteen seeded questions carry `fullstack` as a second role** — the eight
      frontend and three backend ones. The three QA questions do not: a QA interview is not part of
      a full-stack interview. No question was copied; the many-to-many link is the whole point
- [x] The two React questions also gained the **React + Node** variant, so the stack rule can be
      seen working on a real role: a full-stack candidate on React + Node is offered them, one on
      Laravel + Vue is not
- [x] **Walked by hand at 360px**, signed in as a candidate: the onboarding picker offers four roles;
      choosing Full-stack draws its six variants in the role's order with React + Node preselected
      and "Not sure yet" last; `GET /api/content/practice` for a **mid, React + Node** candidate
      returns four questions — `api-error-shape` and `n-plus-one-diagnosis` from the backend bank and
      both React ones from the frontend bank, which is the argument for the role in one response —
      and the same candidate switched to **Laravel + Vue** is offered the two backend ones only
- [x] The three questions already published in the dev database were left alone by the importer and
      **named** in its report, exactly as ADR-0014 decision 7 says; `pnpm db:seed -- --force` was the
      way through. On a production database the honest path is the other one the report offers:
      edit them in `/admin/content` as an admin, which is an audited act against a person's name

**The one thing full-stack does not have: a track.** `GET /api/content/track` answers
`track_not_found` for a full-stack candidate, because tracks are keyed by role and level and nobody
has written one. That is content, not a defect — the track and the boundary questions are
`docs/plans/content-catalogue-banks.md` — but it is the one place the role is visibly thinner than
the three it was built from.

### The `senior` level

- [x] `senior` (rank 30) added to `levels.yaml` as a **draft that no role offers**, so no candidate
      can choose it. The row is the cheap half; the interview behind it (system design, rubric
      dimensions for scope and influence, a longer session) is not written. Recorded under
      § Carried forward with what it will take

### Docs

- [x] **ADR-0015** — nine decisions, five alternatives considered, and §9 records the acceptance
      proof above
- [x] `docs/role-catalogue.md` re-checked against what shipped: wave 1 is in the catalogue now, the
      stack lists match the seeded slugs and their defaults, full-stack stops being a recommendation
      and states what it actually has, and the levels note says `senior` exists but is offered by
      nobody
- [x] `PRODUCT_SPEC.md` §3 (four roles; roles/levels/stacks are content), §4.1 (`target_stack` and
      `technologies` are two different fields), §4.2 (the stack rule), §4.3 (setup reads the
      catalogue; selection filters by stack), §6.1 (the three entities, the five join tables, the
      rewritten `Profile`, `Track` and `Question`)
- [x] `CLAUDE.md` §5 — the catalogue rule, including "if a new role needs a code change, that is a
      bug in the code rather than a step in the task"
- [x] `content/seed/README.md` (a role needs no directory; a second role tag costs nothing) and
      `REVIEW.md` (a **sixth** question for the experts: does this question belong to full-stack too?)
- [x] `docs/PROMPTS.md` — a new M2.5 entry, and the M3 prompt corrected: stack in selection, the
      catalogue on the setup screen, version pinning that now includes role/level/stack, labels not
      keys to the worker, per-role interview types, and the transport ADR renumbered to **0016**
- [x] `docs/plans/m3-interview-engine.md` brought onto the catalogue — the ten edits the M2.5 plan
      listed under "What the saved M3 plan must change", applied now rather than left for M3 to trip over
- [x] Landing copy: "Frontend, backend and QA" is four roles now, in two places

**One code change in this phase, and it is not the role's.** The generated review pages never named
which roles a question is for, and REVIEW.md now asks the experts to confirm exactly that — so
`review-doc.ts` prints `roles: …` in each question's heading, with a unit test
(`review-doc.spec.ts`, the first for that file). The catalogue did not need it; the new reviewer
question did.

**Also learned:** `content:review-doc` does not emit Prettier's markdown (`*cost*` vs `_cost_`), so
regenerating without running `pnpm format` afterwards churns the diff. The README's command block
says so now.

### The verification checklist for this milestone

Run from a clean clone of `feat/m2.5-roles`, with the compose services up
(`docker compose -f infra/docker-compose.yml up -d`) and no `pnpm dev` running:

```bash
pnpm install
pnpm db:migrate                         # every migration applies to an empty database
pnpm lint && pnpm typecheck
pnpm check:contracts                    # Zod → Pydantic and OpenAPI → api-client, no drift
pnpm test                               # 667: 331 API, 117 web, 85 shared-types, 56 ui, 3 api-client, 77 pytest
pnpm test:e2e                           # 7 passed, 5 skipped by design
pnpm db:seed && pnpm db:seed            # the second run reports everything unchanged
pnpm --filter @readi/api content:review-doc && pnpm format   # regenerates with no diff
pnpm build
```

Then, by hand — this is the milestone's actual claim, so it is worth doing once:

1. Publish the catalogue in `/admin/content` (the importer never publishes): the three levels you
   want, the stacks, then the roles. A role refuses to publish until one of its levels is published.
2. Sign up, choose **Full-stack engineer**, and check the picker offers its six variants with
   React + Node preselected and "Not sure yet" last.
3. `GET /api/content/practice` as that candidate; switch the profile to **Laravel + Vue** and call it
   again. The two React questions should disappear and nothing else should change.
4. Try to retire `intern-junior` while a published role offers it. It must refuse (`level_in_use`),
   with copy rather than the server's English.
5. Add a role of your own invention through the CMS alone — no files — and see it in onboarding.
   If any step of that needs a code change or a migration, the milestone has not met its criterion.

### Test accounts to remove when you are done with this branch

The dev database has accumulated nine accounts; **one of them, `you@example.com`, is an admin** — it
came from the example in `CLAUDE.md` §4 being run verbatim, and it is worth removing before anything
is ever exposed beyond localhost.

That example is now an obvious placeholder in `CLAUDE.md`, the README and the CLI's own usage line,
and `admin:grant` refuses when `NODE_ENV=production` unless `--acknowledge-production` is passed
(owner, 2026-09-22). Verified both ways against a production-shaped environment: without the flag it
refuses by name and touches nothing, with it the grant proceeds and is audited.

```bash
PGPASSWORD=readi psql -h 127.0.0.1 -p 15432 -U readi -d readi -c "
  DELETE FROM users WHERE email <> 'aydeggy5@gmail.com';"
```

Every table that holds personal data cascades from `users` (sessions, accounts, profiles,
consent_records, content_flags), so that is a complete removal of their data. What it does **not** do
is the real thing: `eraseUser` (ADR-0011) also replaces the user's id with a tombstone id in the rows
that are kept on purpose — `audit_logs`, `ai_call_log`, `content_versions.changed_by`,
`published_by_user_id` — and a raw `DELETE` leaves those columns holding a uuid that no longer
resolves. On a developer's database that is harmless and the audit trail stays readable. If you would
rather exercise the real path, sign in as each account and use **Profile → Account → Delete**, which
soft-deletes with a 7-day grace period and lets the hourly sweep erase it properly.

`aydeggy5@gmail.com` keeps its admin role either way.

## M2.5 milestone review (2026-09-22)

Four reviewers over the whole milestone (`git diff 833e3fa`): authorization and privacy, schema and
migrations, contracts and the worker, the web and the docs. Findings below; everything not listed as
"fixed" is recorded here on purpose rather than quietly dropped.

### Fixed in this phase

- **A candidate could set their profile to an _unpublished_ level.** `resolveTarget` checked the role
  for `published` and the stack for `published`, and the level not at all — while its own docstring
  claimed all three. Reachable the moment a role lists a level before the level goes out, which is
  the normal way a ladder is extended and exactly what `senior` now is. Fixed with a test that
  fails without the fix (`content-catalogue.int.spec.ts`).
- **Publishing a question whose catalogue tags are all still drafts made it invisible to everyone.**
  Nobody can choose a draft variant, so a question tagged only with one is published, looks published
  in the CMS, and is asked of nobody — the M2 rubric failure on three new axes. `assertPublishable`
  now refuses with `question_has_no_published_role` / `_level` / `_stack` (at least one published per
  axis, since a second tag on the same axis still reaches someone).
  The guard immediately found seven questions in `content-embeddings.int.spec.ts`'s own fixture in
  exactly that state — published against the draft `frontend` / `mid` rows that
  `content-seed.int.spec.ts` leaves behind. That spec mints its own published pair now, like every
  other one. See `tasks/lessons.md`.
- **Three error codes the CMS could receive had no copy** (`role_not_found`, `level_not_found`,
  `stack_not_found` — the "you named a catalogue row that is gone" 400s), so the editor saw "Check
  this field" with no field marked, against ADR-0012 and against ADR-0015's own words. Fixed, and
  `content-errors.test.ts` now **reads the codes out of the API's source** and fails on any that is
  unmapped — which immediately found two more (`content_cursor_invalid`, `content_version_not_found`).
- **`stackFilter` returned a bare top-level `OR`.** M3 is told to reuse it and its selection has an
  `OR` of its own; spreading both into one `where` would have silently dropped one. Now `AND`-wrapped.
- **The claim that the predicate and the filter "cannot drift apart" was only a comment** — and it
  named a file that does not exist. `content-stacks.int.spec.ts` now imports `STACK_RULE` and runs
  the whole table through the database, so a row added to it exercises both.
- **The seed files could break rules only the HTTP contract enforced.** `SeedCareerRole` now carries
  `CareerRoleInput`'s four refines, so two `default: true` stacks in `roles.yaml` are a validation
  failure with a file and a line instead of a picker that starts wherever the query felt like.
- **The role editor could not express "no default"**, although the contract calls it legitimate and a
  native radio cannot be unchecked. Added the row, and the two catalogue forms now mark the fields a
  validation 400 names instead of showing one unattached banner.
- **The visual capture spec had been broken since phase 4 and nobody knew**, because it is skipped
  unless `E2E_SCREENSHOTS` is set. `fillProfile` still typed into "Your main stack", a label that
  stopped existing when `Profile.stack` became `technologies` — so the run hung on a locator that
  would never appear and died on its own timeout with zero screenshots written. Fixed, and it now
  chooses a stack variant as well, so the captured onboarding screens show the picker in use. The
  general lesson is in `tasks/lessons.md`: a spec that only runs on request is a spec that rots,
  and the screens it cannot reach are the screens it cannot photograph.
- **Accessibility:** the stack picker's radios and the question editor's catalogue checkboxes carry
  `aria-invalid` and an `aria-errormessage` pointing at error text that was previously orphaned in
  the DOM; the CMS checkbox and radio rows are `min-h-11` rather than a 24px line of text.
- **The leak test exercised `/api/content/career-roles` with nothing to find** — no marker can appear
  in that payload, and `level_options` is named to miss the field-name check, so an empty response
  would have passed. It now asserts the role, its level and its variant come back, and
  `answer-key.ts` records why that one rename was honest.
- **Erasure**: the account spec's profiles all left `target_stack` null, so the one `RESTRICT`
  foreign key M2.5 added was never exercised, and the "eraseUser acts on what it lists" test covered
  a rubric only — two of twenty tombstoned columns. Both widened.
- **Smaller:** `questionContent` sorts the read side as well as the write side (the database's
  collation and JavaScript's `.sort()` agree for today's slugs by coincidence, not by rule);
  `Profile.targetRoleId` / `targetLevelId` spell out `onDelete: Restrict`, verified to produce no SQL
  drift; `catalogue.ts` and `seed.ts` use the shared `Slug` and `distinctSlugs` instead of three more
  copies of the same pattern; the onboarding e2e asserts the **chosen** variant rather than the row
  label, which it would have passed on either way; `/api/content/career-roles` and the six admin
  catalogue routes joined the documented-route list; two dead copy keys removed; the visual capture
  covers the six new CMS screens (136 shots, about two and a half minutes).

### Recorded, not fixed — each needs a decision or a milestone

- **Before any deploy onto a database with rows: `20260922145408_catalogue_switch` needs catalogue
  rows that only `pnpm db:seed` creates, and `db:seed` cannot run between two migrations.** On a
  fresh database the backfill is vacuous and passes, which is CI and which is why this is not
  blocking. On a database that already has a profile or a track it aborts — correctly, but with no
  way forward, and Prisma writes a failed row into `_prisma_migrations` that blocks every later
  `migrate deploy` until someone runs `prisma migrate resolve --rolled-back` by hand. **Do not fix by
  editing the applied migration** — that changes its checksum and breaks every developer's history.
  Either add a later migration that inserts the five known enum values as drafts before anything
  needs them, or make `e2e-prepare.ts` drop and recreate, and write the recovery into a runbook.
  Whoever deploys first owns this.
- **~~Removing a level or a stack from a role silently invalidates the profiles that chose it.~~**
  **Decided (owner, 2026-09-22): refuse it**, consistent with the existing "cannot retire a level in
  use" rule, and say how many profiles are affected so an admin knows what migrating would involve.
  Implemented as `role_level_in_use` / `role_stack_in_use`, scoped to the role, with the count in the
  error body; recorded in ADR-0015 decision 7.

  **What is still open: there is no way to migrate those candidates.** An admin's only choices today
  are to leave the level on the role or to move each candidate by hand — and nothing in the CMS lets
  them do the second. A bulk "move everyone preparing at X to Y" action belongs with whichever
  milestone first has a real reason to retire a level, and needs its own thought about consent and
  about what the candidate is told. Until then the refusal is a stop sign with no detour, which is
  the right way round but worth knowing.

- **A catalogue past 100 levels or stacks would drop a role's links on save.** The editor warns
  (`catalogueCapped`) but the save still rebuilds the links from the rows it drew. Comments in
  `catalogue-choices.ts` and `catalogue-order.ts` now say so; the fix is a pager in the role editor,
  worth building when the catalogue is big enough to need one (wave 2 at the earliest).
- **`catalogue.spec.ts` leaves its role, level and stack behind on every run.** The e2e database is
  at 11 roles, 10 levels and 30 stacks after a handful of runs, against 4 / 3 / 23 of real content —
  visible in the `m2.5` screenshots as a role editor full of "Principal 26663b18" and
  "Elixir / Phoenix 376f9648". Harmless today and it makes the captures noisy; it stops being
  harmless at 100 rows, where `catalogueCapped` fires and the save-drops-links bug above becomes
  reachable in the e2e itself. The spec publishes its role, so the rows cannot simply be deleted at
  the end — retire the role first, or give the e2e database a reset between runs (`e2e-prepare.ts`
  creates it only if missing, which is the same knot as the migration item above).
- **Two missing indexes**, both cheap and neither urgent: `tracks(level_id)` (the `level_in_use`
  guard and the FK check both scan) and `questions(rubric_id)` (pre-existing; `candidatePractice`
  joins through it). Add them when a migration is being written for another reason.
- **`as_data` neutralises only the exact lower-case tag.** A staff-written label containing
  `</TARGET_ROLE>` passes through un-defanged. Labels are staff-only, capped at 140 characters, and
  the system prompt tells the model to ignore instructions inside them, so this is depth rather than
  a hole — but the helper is advertised as complete and is not.
- **`cv_parse_input.v2.md` is a version number with no change behind it**, because `parse.py` uses
  one `PROMPT_VERSION` for two templates. Give them independent constants before either is released.
- **M10: the landing page has grown to 241 KB / 2.8 s on Slow 4G**, from 169 KB / 2.3 s at the D1
  baseline (`98bb8fd`). Neither M2 nor M2.5 touched that page, so it is shared-chunk growth. It is
  inside the budget the e2e asserts, and it belongs with the message-catalogue item above.
- **Untested new logic**, all of it in `apps/web` where there is still no component testing library
  (a decision deferred to M10, above): `catalogue-choices.ts` (the `capped` flag and the sort rules),
  `profile-errors.ts` (rewritten in phase 4 precisely because the previous version mapped codes
  nothing raised), and `profile-form.tsx`'s `lastRole` ref, which is what stops the edit form
  overwriting a deliberate "Not sure yet" every time it is opened. The last one silently rewrites a
  candidate's answer when it breaks, and is the strongest argument for the testing library.
- **Nine CMS page loads now make five API calls where they made two**, because every editor fetches
  the catalogue its pickers draw from. All server-side and inside `Promise.all`, so no client
  waterfall — but `serverApi()` is not `cache()`d, unlike `getMe`, so a page that calls both
  `roleAndLevelChoices()` and `catalogueChoices()` fetches the levels twice.

## Question banks from the catalogue — stop 1 (branch `content/catalogue-banks`, from `main` at `00daa6f`)

Plan: `docs/plans/content-catalogue-banks.md`. Owner's decisions, 2026-09-22: **stop after the skill
and the blueprints, then after each role**; **five stress-test answers per rubric**, not per question.

- [x] The blocker in the plan's §0 is gone — M2.5 merged, so the catalogue format is final and
      `pnpm db:seed -- --dry-run` is a gate from the first question. The two code changes the plan
      reserved (`content-review-doc.ts` role derivation, the hardcoded role title map) were both made
      in M2.5 and need nothing here.
- [x] `.claude/skills/question-bank/` — SKILL.md, four references, two templates, `check-bank.mjs`
- [x] `content/seed/blueprints/` — 12 role blueprints (waves 1–3), `wave-4.md`, `README.md`
- [x] `check-bank.mjs` runs clean on the existing 14 questions; `pnpm db:seed -- --dry-run` unchanged
      (14 files, everything unchanged — the blueprints are `.md` and the loader ignores them)
- [x] CLAUDE.md §4 and §5 updated; the plan document rewritten to current state
- [ ] **Stop 1: the owner reads the blueprints.** Nothing is drafted until then.

### What the blueprints found — each needs an owner or reviewer decision

- **No backend question is offered at `intern-junior`.** All three are `mid`, so a junior backend
  candidate practises two shared behavioural questions and nothing else. Largest wave-1 content hole.
- **A full-stack candidate never sees a frontend or backend variant question** unless it carries a
  full-stack variant too: a profile holds one `target_stack`, and `laravel-vue` is not `php-laravel`.
  M2.5 solved it for the two React questions (`react-node`); `blueprints/fullstack.md` now states the
  rule for every stack-tagged question in both banks.
- **`react-state` has no general question at all** — both are React-tagged, so Vue, Angular and
  vanilla candidates practise nothing about where state lives.
- **`async-ordering-understanding` descriptor 4 rewards confidence**, which scores delivery rather
  than content. Found by `check-bank.mjs`, fixed in the frontend pass.
- **Three catalogue "stacks" are topics, not variants** — AI/LLM's vector stores and agent
  frameworks, DevOps's Terraform and CI tooling, QA's `manual-exploratory`. Each blueprint proposes
  the deviation and says what overruling it costs.
- **The frontend track and the catalogue disagree** about accessibility and frontend testing being
  core. The track (which feeds readiness coverage, spec §7) says no; the blueprint recommends yes.
  One boolean each.
- **Full-stack's track level is a judgement call**: the blueprint proposes a skeleton at
  `intern-junior` and says why. Owner may overrule.
- **Five of eight role × level combinations have no track** (frontend mid, backend intern-junior, QA
  mid, full-stack both). Lessons work, not question-bank work — but `check-bank.mjs` reports it every
  run so it cannot be forgotten.
- **Group A is ≈ 103 new questions and ≈ 86 new rubrics**, larger than the plan's first estimate of
  ~82, because the counts are now derived per topic per level and because backend and QA need seven
  and six new topics.

## Question banks — frontend (the same branch, `content/catalogue-banks`)

Owner's decisions on the stop-1 findings, 2026-09-22: fix backend's junior gap (backend pass); write
the full-stack variant rule **into the eligibility truth table, not only prose**; give `react-state`
general questions; accept the three "these are topics, not variants" deviations and record in the
catalogue that they become topics or technologies later; make accessibility and frontend testing core
for frontend; full-stack track at `intern-junior`. And: **do not hit a target by writing weaker
questions — if a topic supports two good ones, write two and say so.**

- [x] Decision 2 — the full-stack trap is now mechanical, in three places: two rows in `STACK_RULE`
      (`question-eligibility.spec.ts`) asserting that one role's variant is never inferred from
      another's; a **third distinct stack** in `content-stacks.int.spec.ts`, without which those rows
      collapsed onto the existing ones and asserted nothing; and an **error** in `check-bank.mjs` for
      a question whose role can never be offered it. 361 API tests pass.
- [x] Decision 4 — `docs/role-catalogue.md` now says a stack is what a candidate _is_, names the five
      entries that fail that test, and says they become topics or `technologies` when their wave lands.
- [x] Decision 5 — `accessibility` and `frontend-testing` are `core: true` in `frontend/track.yaml`,
      so they count towards readiness coverage (spec §7).
- [x] `topics.yaml` — `react-state` renamed "Component state and data flow" (slug kept: renaming a
      slug creates a second topic). Two new topics, `written-communication` and `own-work`.
- [x] The bank: **8 questions → 34** (23 general, 11 stack-tagged), 28 new rubrics. Every core topic
      meets its floor at both levels.
- [x] Four critique passes, run separately as parallel subagents. ~109 findings; 54 applied as edits,
      25 left in `reviewer_notes` as judgements for the expert. Counts and what changed:
      `content/seed/blueprints/frontend.md` Appendix B.
- [x] Fact-check against vendor docs, dated, in Appendix A. Three of four checked claims had moved.
- [x] Rubric stress test — 34 rubrics × 5 answers = **170 sample answers**, written from the prompts
      alone by subagents that never saw a rubric, then scored. `evals/datasets/synthetic/frontend/`,
      with a README that says plainly they are model-written and model-scored and **not** the M4 gold
      set. `scripts/check-stress.mjs` enforces the two separations mechanically: **all 34 pass**, and
      three rubrics changed because the answers broke them (see the blueprint's Appendix B2).
- [ ] **Stop: the owner reads the bank.** Leading with the three questions I am least sure about.

### What the critique passes changed that is worth remembering

- **Three of the four passes independently named the same worst problem**: the shared behavioural
  rubric. It could not score what its two questions asked — both questions' best `ideal_points` had
  no criterion to land on — so they rewarded storytelling form, which is coachable in an afternoon.
  And its wording scored delivery: "clear" gated the top of all three criteria, one wanted an account
  "in their own words", one wanted detail enough "to be believable", and **level 0 of the heaviest
  criterion was awarded for saying "we"** — the polite register in much of this audience's working
  culture. Rewritten, and the two questions now have their own rubrics (`help-seeking-judgement`,
  `handling-review-feedback`).
- **A new house rule, and the best single finding of the run: every criterion must have a clause in
  the spoken prompt that asks for it.** Nine questions charged 25–35% for something the prompt never
  requested — ask for a diagnosis, score a fix. All nine prompts fixed; the rule is in `SKILL.md`.
- **Two questions were unanswerable without an employer** (`feedback-on-your-code` needed a code
  reviewer; `error-only-in-production` needed an error dashboard). Both fixed, and `SKILL.md` and
  `REVIEW.md` now carry "assume no employer" as a rule.
- **Level 4 must contain something that cannot be bluffed.** Four descriptors rewarded a claimed
  habit ("would keep a sample of awkward content around") that costs nothing to say.
- **Angular had moved under us.** Zoneless is the default from v21; the change-detection question was
  rewritten around a mutated array, which behaves the same in zone, `OnPush` and signal applications.
  `angular.dev` contradicts itself about whether `OnPush` is now the default strategy — the roadmap
  says yes, the zoneless guide says no — so the question avoids depending on it. Flagged for an
  Angular reviewer.
- **The stress test earned its cost.** It changed three rubrics, and it found one thing worth more
  than any of them: **no rubric has a descriptor that fits a confident, specific, wrong answer.** The
  scores come out right — a fluent wrong answer lands on level 1 or 2 everywhere — but the
  descriptors it lands on were written for vagueness ("a rule with no mechanism", "with nothing
  behind it"), so the evaluator will quote evidence that does not match the answer it just scored.
  That is a house-style change across every rubric in the product, so it is recorded rather than
  applied here, and `SKILL.md` carries it as a rule for the next bank.
- **A local caveat, not a defect:** `pnpm db:seed -- --dry-run` reports four M2 rows as "left alone —
  published" on this machine, because they were published in a developer database. ADR-0014 decision
  7 working as designed; a fresh database takes all 34.

## The owner's six decisions on the frontend bank (2026-09-22)

- [x] **1. `angular-view-did-not-update` kept, flagged for an Angular specialist.** Its
      `reviewer_notes` now opens with the version-sensitive marker and says in as many words that a
      generalist reviewer cannot settle it: the one thing a specialist has to decide is whether
      setting `ChangeDetectionStrategy.OnPush` explicitly in the snippet is the right way around the
      docs contradicting themselves, or whether it gives the game away.
- [x] **1b. How a question is marked version-sensitive** is now a hard rule in `SKILL.md`: the
      `reviewer_notes` opens with `**Version-sensitive: <claim>, checked against <source> on
<date>.**`, plus `— needs a <X> specialist` where it needs one. No schema field, because the
      seed contract would only carry it to a database column nothing reads;
      `grep -l 'Version-sensitive' content/seed/*/questions.yaml` finds them across every bank and
      `grep -o '\*\*Version-sensitive:[^*]*'` prints the claims with their dates. Six questions in
      the frontend bank carry it — the six rows of the blueprint's fact-check appendix.
- [ ] **1c. Version-sensitive questions need a re-check cycle, and it does not exist yet.** Three of
      the four claims checked on 2026-09-22 had moved since the drafter learned them, in a bank
      three months old. The marking above makes the set findable; what is missing is **when** it is
      re-read and **who** by. Cheapest version: a quarterly pass that greps the marker, re-reads each
      claim against the vendor's current docs, and dates the row in the blueprint's fact-check
      appendix — about an hour per bank. Needs a decision on cadence (quarterly? per milestone?
      before each expert review?) and on whether a mark older than one cycle should make
      `check-bank.mjs` warn. **Do not let this become "we will remember": the whole point of the
      2026-09-22 fact-check is that we did not.**
- [x] **2. `something-you-built` kept**, unchanged. Describing your own work clearly is a skill
      practising improves, so a question we cannot anticipate is not a question candidates game.
- [x] **3. `js-async-ordering` rewritten and moved to mid only.** The `console.log` ordering snippet
      is gone; it is now a click handler that sets "Saving…" and then blocks the main thread for two
      seconds, so the message never paints. Same mechanism, unmemorisable, and the rubric became
      `Understanding what the main thread is doing` with three new criteria. **Moving it off
      intern-junior took `javascript-fundamentals` below its floor there**, so
      `js-loop-that-returns-nothing` was written to fill the slot — a `return` inside a `forEach`
      callback, which is where a self-taught junior actually meets this. The bank is 35 questions.
- [x] **4. `react-state-placement` kept.** It is not subsumed: `state-that-can-disagree` covers
      deriving and `url-as-state` covers the URL, but neither asks where shared state should _live_
      — lifting to the nearest common component rather than reaching for a global store, and server
      data belonging in a cache rather than in `useState`. Nothing else in the bank asks either. The
      critique pass's real complaint stands in `reviewer_notes` for the expert: it is the only one
      of the four with nothing concrete to reason from.
- [x] **5. Both Vue questions kept in the Composition API with `<script setup>`**, flagged in
      `reviewer_notes` on both for the reviewers to confirm against what this audience learned on.
- [x] **6. The descriptor finding applied across all 34 rubrics** — 82 descriptors rewritten so a
      confident, specific, wrong answer has words to land on. See the blueprint's Appendix B2.

## Question banks — backend (the same branch, `content/catalogue-banks`)

- [x] **7 new topics** in `topics.yaml` — `caching`, `async-work`, `auth`, `concurrency`,
      `backend-testing`, `observability`, `system-design-basics`. Five will be reused by DevOps,
      data engineering and full-stack.
- [x] **The bank: 3 questions → 37** (25 general, 12 stack-tagged), 35 new rubrics — 33 in
      `backend/rubrics.yaml`, plus `escalating-early` and `unfamiliar-code-approach` in
      `rubrics.shared.yaml` for the two role-general questions the frontend pass said belonged here.
      Every target in the blueprint's `targets` block is met, and the two shortfalls
      `check-bank.mjs` had been reporting since the frontend pass (`written-communication` and
      `own-work` at 1 of 2) are closed.
- [x] **Fact-check against vendor docs**, dated, in Appendix A. **Four of nine claims had moved**,
      and one was a defect in a question rather than in a note: `spring-default-error-body` showed a
      body with `trace` and `message` in it, and both are **off by default** with the keys omitted
      entirely, so the snippet was not something anyone would see out of the box. Also: the docs
      document Spring self-injection as an alternative rather than warning against it, so the rubric
      no longer scores it at level 1; Laravel 13 has moved to PHP attributes; and Node's own API docs
      and learn page disagree about `worker_threads`.
- [x] **Four critique passes, run separately.** ~110 findings; 64 applied as edits, 19 left in
      `reviewer_notes`. Counts and what changed: `content/seed/blueprints/backend.md` Appendix B.
- [x] **Rubric stress test — 37 rubrics × 5 answers = 185 answers**, written from the prompts alone
      by seven subagents that never opened a rubric, then scored. `evals/datasets/synthetic/backend/`.
      All 37 pass the two separations. It broke one rubric outright and sharpened 23 descriptors
      (Appendix B2).
- [ ] **Stop: the owner reads the bank.** Appendix C lists the six things that need a decision,
      in order. The first two are the ones that matter.

### What this pass found that is worth remembering

- **A house rule can smuggle back the defect it was written to remove.** The descriptor rule added
  after the frontend stress test read "a descriptor that fits a **confident**, specific, wrong
  answer" — and writing it that way put the word _confident_ into **34 level-1 descriptors across
  both banks** before two critique passes caught it independently. Every word in a descriptor is a
  scoring instruction, so that one told the evaluator to attend to how an answer sounded, which is
  exactly what `rubrics.shared.yaml` had been reworked to stop that same morning. `SKILL.md` now
  says **"name the belief, never the manner"** with the story attached.
- **Two factual defects in questions a model wrote, both found by reading rather than by checking a
  vendor.** `db-money-as-a-float` asked why naira totals drift a few kobo over a month; `double
precision` carries fifteen to sixteen significant digits and float errors largely cancel, so the
  rubric was charging 30% for an explanation that is not true — _and_ the example value, 1500.50,
  is exactly representable, so the premise was false of the number on screen. `node-async-error-
never-caught` said the request hangs; since Node 15 an unhandled rejection exits the process.
  **A fact-check against vendor docs would have caught neither.** Both came from a critique pass
  doing arithmetic.
- **The prompt-clause rule is not learned once.** "Every criterion must have a clause in the spoken
  prompt that asks for it" was the frontend pass's best finding and is a hard rule in `SKILL.md` —
  and the backend bank still broke it **eighteen times**. It needs a check, not a rule.
- **The stress test paid for itself again, and differently.** On frontend it changed three rubrics;
  here it _proved_ something two critique passes had only argued: `behavioural-answer-quality`
  could not tell a story about the candidate's own break from a polished story about somebody
  else's — 3.70 against 3.70, identical. `incident-you-contributed-to` now has `incident-ownership`.
  A judgement becomes a defect the moment a mechanical check fails on it.
- **A local caveat, not a defect:** `pnpm db:seed -- --dry-run` reports ten rows as "left alone —
  published" on this machine, now including `api-error-shape`, `n-plus-one-diagnosis` and their
  rubrics, because this pass edited them. ADR-0014 decision 7 working as designed; a fresh database
  takes everything, and `-- --force` is the way through on a developer one.

## The owner's six decisions on the backend bank (2026-09-23)

All six taken as recommended; `content/seed/blueprints/backend.md` Appendix C records what each
cost. The bank is **34 questions** (25 general, 9 stack-tagged), 38 offered to a backend candidate.
69 rubrics and 345 stress answers across both banks, all passing.

- [x] Level tags: ten general questions at `intern-junior`, the rest `mid` only. **Seven floor
      shortfalls accepted rather than padded** — `databases`, `caching`, `backend-reliability` and
      `backend-testing` have nothing at intern-junior. Reported every run.
- [x] `api-error-shape` and `the-counter-that-lost-updates` cut; `what-happens-when-it-is-down`
      narrowed to what the user is told.
- [x] The judgement ratio is now **one in four of what a candidate is offered, by topic
      (`collaboration`, `written-communication`, `own-work`) rather than by `type`** — the two best
      judgement questions are typed `scenario`. Backend: 9 of 38, 24%.
- [x] Added `the-ticket-nobody-can-explain` and `a-change-you-are-not-sure-about`, both carrying all
      four wave-1 roles.
- [x] `golang`, `dotnet` and `ruby-rails` off `roles.yaml`; three questions, rubrics and stress sets
      removed with them.
- [x] Nine untagged questions say "JavaScript" in the prompt.

- [ ] **Ask the reviewers which backend variant this market actually hires for** before restoring
      any of `golang`, `dotnet` or `ruby-rails`. The rule that removed them is the blueprint's own:
      a variant with one question is a variant we are not serving, and advertising one in the
      onboarding picker and then handing that candidate the general set is worse than not offering
      it. Whichever they name comes back with a bank of its own, not one question. The three
      `stacks.yaml` rows are untouched, so restoring is a `roles.yaml` line plus the questions.
- [ ] **Four judgement-and-communication slots left**, from the same critique pass: shipping to
      production with nobody else awake; explaining a cause to support and to a team lead in two
      registers; and two more of the reviewer's choosing. These come before more snippet questions —
      22 of 34 already hand the candidate a planted defect.
- [ ] **The junior shortfall above is a worklist.** Seven topic-level gaps at `intern-junior`, each
      one a question that has to be genuinely junior rather than a mid question relabelled.

## Question banks — QA (the same branch, `content/catalogue-banks`)

**Drafted 2026-09-23. 3 questions to 35** (25 general, 10 stack-tagged), 33 rubrics, six new topic
rows. A QA candidate is offered **45**, because ten role-general questions in the frontend and backend
banks carry `qa` — nine already did, and `it-works-for-me` gained the role in this pass, which its own
notes had asked for. Everything is `status: draft` / `author: ai_draft`.

Built to `content/seed/blueprints/qa.md`, which now carries the fact-check log (Appendix A), what the
four critique passes changed (Appendix B) and the coverage (Appendix C).

- [x] Six new topics: `risk-based-testing`, `testing-apis`, `test-automation`, `ci-pipelines`,
      `exploratory-testing`, `test-data`
- [x] 23 new questions and 3 reworked; 30 new rubrics
- [x] Four critique passes, run separately — 139 findings, 105 applied, 25 left in `reviewer_notes`
- [x] Fact-check: 8 version-sensitive claims against current vendor docs; **3 had moved**
- [x] Arithmetic worklist — three numeric defects found and fixed, none of them by the fact-check
- [ ] Stress test — 33 rubrics × 5 answers, in progress
- [ ] `content:review-doc` regenerated for the reviewers
- [ ] Owner's decisions (below)

### The two shortfalls, reported rather than filled

Decision-1 doctrine from the backend bank, applied here. `check-bank.mjs` prints both every run.

- `test-automation` @ intern-junior: **1 of 2** — `what-to-automate-first` went mid-only because its
  40% criterion needs a suite somebody has maintained.
- `performance-testing` stack: **1 of 2** — `performance-what-to-ask-first` was untagged.

### What the skill learned, and what became a check

- **Weights were a template, not a claim.** 21 of 30 QA rubrics were exactly 35/35/30 against 11
  distinct patterns in frontend and 12 in backend. `check-bank.mjs` now warns when one split covers
  more than half a rubric file.
- **The manner defect returned in a third form** — the wrong answer defined by the _quantity_ of
  speech ("a detailed plan", "a thorough set of flows", "Prices it accurately"). Nine in QA, and the
  new check found **seven more in the frontend, backend and shared files**, so it was never a QA
  problem. All sixteen fixed; `detailed`, `in detail`, `thorough*`, `accurately` and `at length` are
  now on the suspect list.
- **A promise the evaluator cannot read is not a promise.** `qa/rubrics.yaml` had none of the
  protective clauses `rubrics.shared.yaml` carries eleven of, and the bank's fairness promise sat in a
  YAML comment that said the seed format had nowhere to put it. It does: the descriptor.
- **The thing you would hire on belongs at level 3, not level 4.** All 90 QA level-4 descriptors were
  additive; in six criteria the behaviour worth hiring on was in the level-4 clause, so a candidate
  scoring 3 throughout read as competent while missing the point of every criterion.

### Open for the owner — the QA decisions

1. **The triple-barrelled prompt — DECIDED 2026-09-23, not yet implemented.** Resolved as "different
   moments": the opening prompt asks one thing, the remaining criteria become **planned follow-ups
   stored on the question**, and the check becomes "every criterion is asked for by the prompt **or** by
   a planned follow-up". The field lands **before M3** so `interview_followup.v1.md` is written against
   it; the engine wiring and the per-criterion coverage log are M3. Consequence worth knowing: **the
   rubric stops reaching the interviewer model entirely.** Measured cost to retrofit: **208 follow-ups
   and 104 prompts** across the three banks, uniformly two per question. Sequencing: the field plus
   QA's 70 as the pilot, then frontend and backend, then full-stack. Full reasoning and what is still
   open: `docs/progress/2026-09-23-planned-follow-ups.md`; `docs/plans/m3-interview-engine.md` updated.
   **The full-stack pass is held until this is built.**

   The original framing, kept because it is why the decision was needed:
   **The triple-barrelled prompt, and the engine.** Both the senior-interviewer and the
   nervous-junior pass made this their first finding, and the senior pass's argument is the one that
   matters: asking all three clauses up front **pre-empts the engine**, whose job is to generate
   follow-ups that probe missing rubric points (CLAUDE.md §5). Against it stands the prompt-clause
   rule, written because the frontend pass found nine criteria charging for something never asked and
   the backend pass eighteen, and enforced by `check-bank.mjs`. **This changes every bank and the
   skill, so it was not resolved inside QA.** The likely resolution: the prompt must raise every
   criterion's _subject_, and the follow-up draws out the detail.

2. **`behavioural-answer-quality` — DELETED 2026-09-23** (`e912038`). Four questions used it and all
   four needed their own; `SKILL.md` carries the table and the structural reason, the template no longer
   offers it, and `REVIEW.md` no longer tells reviewers the sharing is deliberate. The importer never
   deletes, so a developer database keeps the row.
3. **`manual-exploratory` is the default QA variant and has zero tagged questions.** The blueprint's
   argument for that still holds — its subject matter is the general set, and tagging would hide test
   design from automation candidates. The consequence it did not state: the most common candidate in
   this market practises nothing about their own working week (keeping 400 manual cases useful, how a
   cycle is planned and reported, what goes in a summary a stakeholder reads).
4. **The largest content gap is Android on a real phone, as general content.** Almost everything
   shipped here is an Android app on a mid-range phone, and the only question about devices, network,
   permissions, storage or app upgrade is `appium-passes-on-the-emulator` — tagged, mid, about a tool.
5. **Two questions one pass would cut or replace**: `where-the-tests-run` (reframed so the candidate
   advises rather than decides, which may not be enough) and one of the three questions about a signal
   nobody believes (`the-suite-nobody-trusts`, `intermittent-failure-triage`,
   `the-pipeline-has-been-red` — a senior interviewer would ask one of the three in an hour).
6. **Appendix C lists eight more gaps** worth a round two, the cheapest being "here is a user story
   and its acceptance criteria — what would you refuse to sign off?"

### Still open from earlier passes, unchanged

The **version-sensitive re-check cycle** (now 23 marked claims across three banks, and **three of the
eight QA claims had moved after one day**), the **seven backend junior shortfalls**, the **four
backend judgement slots**, and the missing `intern-junior` backend track / `mid` frontend track /
`mid` QA track — `track_not_found` for those candidates, and lessons work rather than
question-bank work.

## Planned follow-ups — the field, and QA as the pilot (2026-09-23, branch `content/catalogue-banks`)

Implements the decision in `docs/progress/2026-09-23-planned-follow-ups.md`. Stop at the end of the
pilot for the owner's review; frontend, backend and full-stack are the next passes.

### The three questions the handover left to the pilot, and what the pilot decided

- **Shape**: `planned_follow_ups: [{ criterion, probe }]` — `criterion` is the criterion's position
  in the rubric (0-based, as `rubric_criteria.position` stores it), `probe` is one spoken sentence.
  **No condition field**: the condition is already the engine's rule ("ask this only for a criterion
  the answer has not covered"), so prose the engine would have to branch on never arrives.
- **One probe per criterion**, enforced — duplicates are an error. `max_follow_ups` is 2 against
  three criteria, so the engine is already choosing; a second probe for the same criterion multiplies
  that choice for nothing.
- **The ask-check becomes an error**, not a warning: `asks(prompt) + follow-ups ≥ criteria`. The
  broad-clause escape hatch goes with it — a probe is a better answer than a note in `reviewer_notes`,
  and it is now available. All 104 questions pass it today, so nothing else in the repo breaks.

### Phase A — the field · **done**

- [x] Contracts: `PlannedFollowUp`, `QuestionInput.planned_follow_ups` (**required**, so a client that
      has not heard of it cannot silently wipe a question's probes), `SeedQuestion` (defaulted),
      limits in `constants.ts`, contract tests
- [x] Prisma column + migration — Prisma proposed `DROP INDEX questions_embedding_hnsw` for the
      **fourth** time and it was deleted; the index is verified present
- [x] `content.service.ts`, `content.mappers.ts`, `seed-import.ts`
- [x] `review-doc.ts` — each probe under the criterion it probes, and a fifth reviewer tick box
- [x] Leak test: one fixture marker, plus the real corpus in `content-seed.int.spec.ts`; a round-trip
      test in `content-admin.int.spec.ts`; the e2e writes one through the CMS form at 360px
- [x] CMS question editor (criterion labelled from the selected rubric, fetched on change), i18n
- [x] `check-bank.mjs`: range, distinctness, punctuation, and the ask-check **as an error**
- [x] `pnpm gen:contracts`, docs (CLAUDE.md, seed README, REVIEW.md, SKILL.md, template, M3 plan)

### Phase B — QA's follow-ups · **done, reviewed by the owner 2026-09-23**

- [x] 35 prompts cut to one ask; 70 probes written against the criteria the prompt no longer asks,
      then **74** after the owner allowed a second probe per criterion (below)
- [x] Four critique passes on the reshape — 93 findings, 73 applied, 13 to `reviewer_notes`
- [x] All checks green; `content:review-doc` regenerated
- [x] Handover: `docs/progress/2026-09-23-planned-follow-ups-pilot.md`

### What the pilot sends back to the owner

1. ~~One probe per criterion is not quite enough, twice.~~ **Decided 2026-09-23: a criterion may carry
   two probes, three is refused, and the three questions are fixed** — `test-design-signup-form` and
   `api-collection-that-only-works-in-order` carry three probes each, `pushing-back-on-a-release`
   four. The first probe listed for a criterion is its primary one; the engine prefers a criterion
   nothing has probed yet and reaches a second only when no other criterion is uncovered, which is now
   a selection rule in the M3 plan.
2. **"Needed no prompting" is a signal we throw away** — a candidate who covers everything unprompted
   scores the same as one probed twice. M4 report question, not a content one.
   **A content decision now waits on this one (owner, 2026-09-25).** After all three banks were
   retrofitted, every snippet question opens on a diagnosis and about 37% of the score is guaranteed,
   with the heaviest criterion behind a probe in nine backend questions. The owner has decided **not**
   to invert those openings — a candidate cannot decide about a bug they have not diagnosed, and
   opening with "what would you change?" rewards pattern-matching on the snippet's shape. **The
   resolution is here instead: if a prompted answer scores slightly below a volunteered one, "the
   heaviest criterion sits behind a probe" largely dissolves across all three banks without a single
   prompt being rewritten.** `SessionTurn.follow_up_index` already records which probe produced which
   turn (`docs/plans/m3-interview-engine.md`), so the data exists; what M4 owes is the scoring rule.
3. **`max_follow_ups = 2` leaves the engine no budget** to chase a vague answer, because both slots
   are planned. M3 decision.
4. **Five openings ask a criterion lighter than one of their probes** — reported, not changed; nothing
   is unreachable, and `criteria_covered` is what makes the exposure auditable.

### Next

- [ ] Frontend (70 probes) and backend (68), to the rules the pilot added to `SKILL.md`
- [ ] Full-stack — still held; a tagging pass that inherits whatever the other banks carry

## Frontend planned follow-ups — the retrofit (2026-09-24, branch `content/catalogue-banks`)

The shape QA piloted, applied to the frontend bank. **13 prompts rewritten, 81 probes**, four
critique passes (51 findings, 40 applied, 11 recorded). `content/seed/blueprints/frontend.md`
Appendix B3 has the detail. Checks green: `check-bank.mjs` (no errors, the same 53 warnings as
`main`), `check-stress.mjs`, `pnpm db:seed -- --dry-run`, `pnpm format`, 365 API + 120 web + 91
shared-types tests.

### What the passes changed that the QA pilot had not already taught

- [x] **A prompt cut to its first clause is not a prompt cut to its first criterion.** Six questions
      had the un-probed criterion mis-aimed; all six openings re-aimed. This is the sharpest thing
      learned in this pass and it belongs in `SKILL.md` if the backend pass repeats it.
- [x] Two questions had opening and first probe swapped (`it-works-for-me`,
      `state-that-can-disagree`) — the order-of-work rule, found again.
- [x] Ten probes handed over what their criterion scores; reworded.
- [x] Five criteria that score two separable things gained a second probe (ten in total now).

### Decided by the owner, 2026-09-24 — `docs/progress/2026-09-24-frontend-probes.md`

All four were decided the same day. The detail and the reasoning are in the handover; what follows is
the work each one leaves, and none of it is a question change.

1. **Six frontend descriptors need a fairness clause.** `frontend/rubrics.yaml` carries **two**
   protective clauses across ninety criteria; `rubrics.shared.yaml` carries eleven. The
   planned-follow-up field removed the escape route a candidate used to have — answering around
   the criterion they had no workplace to answer from — so the rubric's silence is now
   load-bearing. `help-seeking-judgement` criterion 3 is the worst: 40%, and a self-taught
   candidate with nobody to ask has no route above level 0.
2. **Three level descriptors have been made unreachable by the format.**
   `state-placement-reasoning` criterion 2 level 1 is "notices the duplication **only when
   prompted**" — the probe _is_ the prompting, so every candidate reached by it caps at 1 on 30%.
   `url-state-reasoning` criterion 3 level 0 and `client-boundary-reasoning` criterion 2 level 0
   are unreachable for the same reason: the probe supplies what level 0 is defined by not having.
   **This generalises to every bank**, and is worth checking on QA before the backend pass.
3. **`check-bank.mjs` cannot see any of this.** It counts asks and probes; it cannot tell which
   criterion the opening asks. The pilot's own lesson — a rule that must be remembered once per
   instance needs a check — applies to the rule the pilot itself added. A check that flagged
   "the un-probed criterion is not the one the opening names" would need the opening matched to a
   criterion, which is the lexical comparison that failed at 130 warnings before; the cheaper
   version is to require a `reviewer_notes` line naming the un-probed criterion.
4. `stuck-and-asked-for-help` now says "and ended up asking someone for help" in the opening. That
   fixes the ambush the probes were creating, and it is a **shared** rubric used by four banks —
   the descriptor fix in (1) is what makes it fair rather than merely coherent.

### Next, in this order

- [x] **The six fairness clauses and the three dead descriptors** (decision 2), starting with
      `help-seeking-judgement` criterion 3, and widening what counts as asking so
      `stuck-and-asked-for-help` is fair as well as coherent (decision 1). Changing a descriptor
      moves scoring, so this needs its own `check-stress.mjs` run.
      **Done 2026-09-24** — see the section below and
      `docs/progress/2026-09-24-rubric-fairness.md`.
- [x] **Check QA and backend for the same two gaps** — done 2026-09-25,
      `docs/progress/2026-09-25-fairness-sweep-qa-backend.md`. Two fairness passes, one per bank,
      run separately; 15 findings, **five did not survive checking against the file**. Applied: 3 in
      backend (`alerting-judgement` 3, `unfamiliar-code-approach` 2 + 3, `worker-deploy-diagnosis` 3)
      and 7 edits across 5 QA criteria (`api-evidence-reading` 2 — the worst, a route written into
      level 4 and gated behind a level 3 that needs the thing; `rule-interaction-test-design` 3,
      `transactional-test-design` 2, `raising-a-quality-concern` 3, `test-case-selection` 3). Plus
      eleven silent level 0s and a new check (`7ea284f`). **The mechanical signal was wrong**: the
      regex said backend had none, and the reason is that a scenario prompt supplies the workplace —
      clauses belong on behavioural criteria and almost nowhere else.
- [ ] **Backend (68 probes)**, opening with the mis-aim check (decision 5): per question, name the
      criterion the opening asks and check it is the one without a probe.
- [ ] Full-stack — still held; a tagging pass that inherits whatever the other banks carry.

Done 2026-09-24: `error-only-in-production`'s opening tightened (decision 3); five uncertain probes
flagged in `reviewer_notes` rather than changed (decision 4); three rules added to `SKILL.md`.

## Frontend rubric fairness — items 1–3 (2026-09-24, branch `content/catalogue-banks`)

The owner's decisions 1–3 from `docs/progress/2026-09-24-frontend-probes.md`, done and stopped for
review. **Nine descriptor changes, no question changed.** Handover:
`docs/progress/2026-09-24-rubric-fairness.md`; blueprint detail: `frontend.md` Appendix B4.

- [x] **Decision 1** — `help-seeking-judgement` criterion 3 (shared, 40% of its question) widened:
      asking is reaching outward by whatever route was open — a colleague, a community, a group
      chat, an issue thread — in the description and in levels 3 and 4. The question's
      `ideal_points` say the same, and the shared file's header records why. Reaches four banks.
- [x] **Decision 2** — six fairness clauses (`help-seeking-judgement` 3,
      `test-brittleness-diagnosis` 2, `performance-investigation` 2, `semantic-html-diagnosis` 3,
      `secret-exposure-diagnosis` 3, `resilient-layout-reasoning` 3) and the three descriptors the
      probes had made unreachable (`state-placement-reasoning` 2 level 1, `url-state-reasoning` 3
      level 0, `client-boundary-reasoning` 2 level 0).
- [x] **Decision 3** — verified, not re-done: `error-only-in-production`'s opening was already
      tightened in `a294ea6`.
- [x] Checks: `check-bank.mjs` no errors and **53 warnings byte-identical to HEAD's** (diffed
      against a worktree, not eyeballed); `check-stress.mjs` 103 sets, every separation passes, no
      score moved; `db:seed --dry-run`; `content:review-doc`; `format`; `lint`; 365 API + 91
      shared-types tests.

### What this pass sends back to the owner

1. **The widening is in the rubric, not in the opening**, which still says "asking someone for
   help". A self-taught candidate may still hear a question about a workplace they have not had,
   and no rubric clause reaches them before they answer. Flagged in `reviewer_notes` too. Your
   call whether the opening should say it aloud.
2. **A stress set that does not reach the descriptor you changed proves nothing.** Every
   `help-seeking-judgement` answer had a colleague to ask. The `correct-poorly-explained` answer
   was rewritten — self-taught, asking in a cohort WhatsApp group, same substance said just as
   badly — and still scores 3 / 3 / 3. A skill rule if the backend pass hits it again.
3. **The reviewer pages are built per directory, not per role.** `buildReviewDoc` filters by the
   seed file's path, so the four role-general behavioural questions living in
   `content/seed/frontend/` appear only on the frontend reviewer's page — a QA reviewer signs off
   35 questions while their candidates are offered 45. A code change in
   `apps/api/src/content/review-doc.ts`, and the owner's call whether it comes before the
   reviewers are sent the pages.
4. **Fairness clauses do not fit in a criterion description.** `criterionDescriptionMaxLength` is
   300 characters; two of the six clauses moved down into the level descriptors, which is the
   better place anyway — a clause in the description is guidance, a clause in level 3 is a score.

### The owner's answers, and what they left — all done 2026-09-25

- [x] **1. Say the widening in the opening too.** `stuck-and-asked-for-help` now asks "…ended up
      asking someone for help — whether a colleague, a community or a group chat". A clause in a
      descriptor fixes the score; only a clause in the prompt reaches the candidate before they
      flinch. `reviewer_notes` now asks whether it sounds like something you would say out loud.
- [x] **2. `review-doc.ts` builds pages per role, by the roles a question carries.** frontend
      35 → 40, backend 34 → 38, **QA 35 → 45** (the ten unreviewed ones). A shared question names
      its own file beside it; the role's own questions print first; the track is selected by
      `track.role` rather than by path. **`fullstack` now gets a page — 62 questions, all shared**,
      because the CLI listed roles by "has a directory" and so the role with the most unreviewed
      content reaching candidates was the one getting no page at all. The test the owner asked for
      loads the real corpus and asserts, per role in `roles.yaml`, that every question carrying
      that role is on that role's page and the page's count matches. Nine new tests, API suite 374.
      `content/seed/REVIEW.md` corrected with it: it claimed there was no full-stack page and that
      full-stack was "eleven of the questions" on the other pages, when 62 carry it.
- [x] **3. Skill rule** — a clause in a criterion description is guidance, a clause in a level
      descriptor is a score; fairness clauses belong in the descriptors.
- [x] **4. Skill rule** — when a rubric changes to include a case, the stress set needs an answer
      from that case, or the change is untested. Rewrite the kind that fits; a sixth answer is
      ignored by `check-stress.mjs`.

**One thing left for the owner**: if a 288 KB full-stack page of questions a reviewer has already
seen on the other three is not wanted, `hasContent` in `apps/api/src/cli/content-review-doc.ts` is
the line, and the corpus test would then skip roles with no page rather than asserting one for
every catalogue role.

## The fairness sweep, and the full-stack page (2026-09-25, branch `content/catalogue-banks`)

Handover: `docs/progress/2026-09-25-fairness-sweep-qa-backend.md`. Four commits: `12a6e5a` the
full-stack page's asks, `7ea284f` the silent level 0s and the check, and the sweep itself.

- [x] **The full-stack reviewer is asked about the set, not about each question** (owner's
      refinement). A role with no bank of its own gets its own "What we are asking you": is this the
      right set, and **what is missing between them** — the questions that only come up when one
      person owns both ends. Keyed on "no questions of its own", not on the slug.
- [x] **A level 0 reading only "Not addressed." is silence, not a wrong answer.** Eleven rewritten;
      eight backend ones are warnings until its retrofit. `check-bank.mjs` enforces it.
- [x] **QA and backend swept** for both gaps. Ten criteria changed, five findings rejected.

### Decided by the owner, 2026-09-25

- [ ] **The stress sets against the probes — after all four banks are retrofitted, not before.**
      The QA sets were written before probes existed; frontend's and backend's will be in the same
      position. Doing it once against the final shape rather than twice is the whole point, so this
      waits for the full-stack pass to land. Scope: every set, every answer written against the
      whole exchange (`references/stress-test.md`), because a descriptor whose meaning depends on
      the probe having been asked cannot be confirmed by an answer that only meets the opening.
- [x] **`status-code-honesty` at `intern-junior`** — left flagged for the reviewers, not changed.
- [ ] **QA → full-stack tagging**: left for the held tagging pass, which is to consider
      **whether one or two testing-mindset questions should cross over**. No QA question carries
      `fullstack` today, against 31 of frontend's 35 and 31 of backend's 34.
- [ ] **Sweep every `reviewer_notes` for flags that are known defects rather than questions for an
      expert, and fix or escalate each one.** From `api-evidence-reading`: the drafter had written
      "the descriptors may still read as assuming one" and the fix was never applied, so a 35%
      criterion capped an honest answer at 2 for three days. A flag nobody acts on is a record of a
      bug, not a mitigation. The two kinds are distinguishable: "is this the right weight?" is a
      judgement an expert should make, "this descriptor still assumes X" is a defect with a known
      fix. Run it over all four banks, sort into fix / escalate, and say which in the blueprint.

### What the sweep taught, now in `SKILL.md`

- A protective clause belongs on a **behavioural** criterion and rarely anywhere else: a scenario
  prompt supplies the workplace, and a rubric written in the hypothetical needs no route however much
  workplace furniture it mentions. This is why the clause-count signal overstated the backend gap.
- A rubric change must not **evict** the case it already had. Three rewrites in this pass would have
  stranded an existing stress answer by narrowing a level 1 to the post-probe wrong answer; all three
  were widened to hold both. Check the set in both directions, not only for the new case.

### Next

- [x] **Backend — done 2026-09-25**, `docs/progress/2026-09-25-backend-probes.md`. **34 prompts cut
      to one clause, 70 probes**, four critique passes on the reshape (44 findings, 34 applied).
      The mis-aim check ran first and changed **eight** openings a mechanical cut would have got
      wrong. The eight silent level 0s became errors the moment their criteria were probed, exactly
      as the check predicted, and were cleared as part of the pass.
- [x] **Full-stack tagging — done 2026-09-25**,
      `docs/progress/2026-09-25-fullstack-tagging.md`. An audit, not a rework: every general frontend
      and backend question already carried `fullstack`, and all thirteen stack-tagged ones already
      reach one of the role's six variants. **Two QA questions crossed over** —
      `what-to-test-when-there-is-no-time` and `where-your-test-data-comes-from` — taking the role
      from 62 to 64 available. One re-tag declined (`python-blocking-call-in-async` is a FastAPI
      snippet and `django-react` means Django), one word fixed in `test-data-judgement`.

## The backend retrofit (2026-09-25, branch `content/catalogue-banks`)

Handover: `docs/progress/2026-09-25-backend-probes.md`; detail in `blueprints/backend.md` Appendix D.
Commits: `6207ee5` the mechanical retrofit, `90d93f4` the stale notes, and the critique passes.

### What generalises, and is now in `SKILL.md`

**A probe that names what its criterion scores is worse than the clause it replaced, not merely as
bad.** A clause was asked of everyone; a probe is asked only of the candidate whose answer missed
that criterion — so a leading probe converts a miss into a gift, to precisely the candidate who had
not earned it. Eleven of seventy probes needed rewriting on this in one pass.

**And the silent-level-0 check was matching half the defect.** It matched whole strings, so "Not
addressed — the answer is entirely about the code" escaped it on 35% and 25% criteria. It now also
errors when a level 0 merely _opens_ with a non-answer and the criterion is probed: that found nine
more across all four rubric files, one of them in `rubrics.shared.yaml`. Twenty-two level 0s
rewritten over the two days.

### Decided by the owner, 2026-09-25

1. **Do not invert the snippet openings.** A candidate cannot decide about a bug they have not
   diagnosed, and opening with "what would you change?" rewards pattern-matching on the snippet's
   shape. The arithmetic complaint — 37% guaranteed, the heaviest criterion behind a probe in nine
   questions — **is M4's to answer, not the banks'**: if a prompted answer scores slightly below a
   volunteered one, it largely dissolves across all three banks with no prompt rewritten. Recorded
   against the M4 item above so M4 knows this is waiting on it. Rule in `SKILL.md`.
2. - [x] **Depth cue on diagnosis openings — done 2026-09-25**,
         `docs/progress/2026-09-25-depth-cues.md`. **54 of 104 prompts** gained one; no opening was
         rewritten and no criterion moved. Three cues, assigned by whether there is something on screen
         and whether the prompt already points at it. Frontend 26, backend 15, QA 13 — QA fewest
         because twenty-two of its openings already invite a list, backend fewest relative to size
         because eight already say "explain" or "walk me through". `check-bank.mjs` no longer counts a
         cue towards the asks, or every diagnosis question would have had a free one; its output is
         byte-identical to HEAD's. Done ahead of the stress-set rewrite rather than with it, because a
         cue changes no descriptor and adds nothing to that rewrite's scope.
3. **The fourteen "what would you change?" probes stay**, flagged for the reviewers in
   `content/seed/REVIEW.md` rather than changed.
4. - [x] **`the-ticket-nobody-can-explain` opens with "Write me the message you would send them."**
         If that is the one remote-predictive artefact in the bank, it should not be conditional on the
         candidate having missed something. Done 2026-09-25: criterion 2 (35%, "writes something that can
         be answered asleep") is now the un-probed one, and criterion 1 gained the probe "What did you go
         and look at before you wrote that?". **It is the first question in any bank whose un-probed
         criterion is not criterion 0** — which is the rule working as written, since the rule is "the
         opening asks the un-probed criterion", not "the opening asks criterion 0". The senior pass had
         flagged the positional habit as a risk; this is the first break from it.
5. **A probe that names what its criterion scores converts a miss into a gift**, given only to the
   candidate who had not earned it — worse than the clause it replaced, not merely as bad. Already
   first-class in `SKILL.md` under the probe rules.

## The depth cues and the full-stack tagging (2026-09-25, branch `content/catalogue-banks`)

Two passes, handovers `docs/progress/2026-09-25-depth-cues.md` and
`docs/progress/2026-09-25-fullstack-tagging.md`. Decision 4 from the backend retrofit was verified
as already applied (`bd76be6`), not re-done.

### What is now left on the banks, in order

- [ ] **Sweep every `reviewer_notes` for flags that are known defects rather than questions for an
      expert**, and fix or escalate each one. Unchanged from 2026-09-25; the two passes above added
      four notes and none of them is of that kind.
- [ ] **The stress sets against the probes** — every set, every answer written against the whole
      exchange. Now unblocked: all four banks are retrofitted and the full-stack pass has landed. The
      depth cues add nothing to its scope, because a cue changes no descriptor.
- [ ] **The full-stack role's own content — a later pass, deliberately deferred** (owner's decision,
      2026-09-25). It is writing, not tagging, and it waits for two things that do not exist yet:
      **M4 showing real scoring** on the banks as they stand, and the **experts' first round** coming
      back. Writing eight more questions before either would be drafting against the same
      unvalidated assumptions three times over. What is outstanding: - **No track at either level.** A full-stack candidate gets `track_not_found` at
      `intern-junior` and at `mid` today. `blueprints/fullstack.md` recommends one skeleton track
      at `intern-junior` first, in the shape of `backend/track.yaml`. - **`fullstack-boundary` 0 of 5** (2 intern-junior, 3 mid) and **`deployment-basics` 0 of 4**
      (2 and 2) — the ~8 boundary questions, the whole of this role's own bank. The blueprint names
      their shape: "the form saves but the list does not update", "the price is right on the screen
      and wrong in the database", "you deployed the API and forgot the migration".
      `the-field-that-changed-shape` is the stand-in until they exist. - **Three variant shortfalls that only new questions can close**: `django-react` 1 of 2,
      `ruby-rails` 0 of 2, `dotnet-react` 0 of 1. A re-tag cannot close them —
      `python-blocking-call-in-async` is a FastAPI snippet and `django-react` means Django — and
      there is no Rails or .NET question in any bank. - Five of the eight role × level combinations still have **no track at all**; the checker
      reports each one every run.

### Open for the owner

1. - [x] **`the-field-that-changed-shape` tagged for full-stack**, 2026-09-25 — the owner took it on
         merit rather than on the brief: it is the role's best available question on its defining topic
         and the boundary questions are not imminent. Criterion 2's level 4 was widened with it, because
         "what they would ask the API's owners for" describes no answer a candidate who owns both ends
         would give. 65 available.
2. - [x] **`test_design` stays off `fullstack`** (owner's decision, 2026-09-25). QA's three "What
         would you test?" questions therefore cannot carry the role, and that is deliberate — the three
         crossovers are enough.
3. **Every general frontend and backend question transfers**, against the blueprint's estimate of two
   thirds. `content/seed/REVIEW.md` §7 now asks the expert whether that is over-tagging.
4. **The diagnosis/decision line has no check behind it**, so the next bank needs the depth cue
   applied by hand — the same gap the mis-aim check has, and for the same reason.

## The programme closed (2026-09-25, branch `content/catalogue-banks`)

**Closing handover: `docs/progress/2026-09-25-question-banks-closing.md`** — what exists per role and
level, what the skill learned, every open reviewer question, and what the next content pass should
cover. Content work stops here; the branch merges and M3 starts.

Final state: 4 roles · 3 levels · 23 stacks · 29 topics · 102 rubrics · 104 questions · 225 planned
follow-ups · 3 tracks · 102 stress sets · 14 blueprints. Offered per role — frontend 40, backend 38,
QA 45, full-stack 65.

The next pass's order, and the reasoning is in the closing handover: the `reviewer_notes` sweep
first (it needs nothing else and is most likely to be hiding a live defect), then the stress-set
rewrite, then the five missing tracks, then the full-stack content above, then backend at
intern-junior, then wave 2.

## M3 — the interview engine, text mode (branch `feat/m3-interview-engine`, from `main` at `d380611`)

Plan: `docs/plans/m3-interview-engine.md`, written 2026-09-23 and **amended at the start of this
branch** — the amendments are listed under "What changed since the plan was written" below and are
folded into the plan document in phase 1, not before, because three of them are the owner's call.

### What changed since the plan was written (2026-09-23 → 2026-09-25)

The plan was saved before the question-bank programme ran. 31 commits landed between, and the parts
of the plan that quoted the corpus are now wrong — always in the direction of more content.

1. **The corpus is 30× what the plan assumed.** The plan's session-length table justifies deferring
   45 minutes with "8 frontend / 3 backend / 3 QA today, plus full-stack sharing 11". The real
   figures are 104 questions / 102 rubrics, offered per role: frontend 40, backend 38, QA 45,
   full-stack 65. The stated reason for the 15/30-only decision no longer exists. **Owner decision 2.**
2. **Probes exist for every bank, not only QA.** The plan says "the QA bank carries all 74 of its
   probes"; there are **225** across the three banks. `interview_followup.v1.md` is written against
   the real corpus for all four roles rather than against QA alone.
3. **The two-probe selection rule is exercised by 16 of 104 questions** — 88 questions carry exactly
   two probes (budget = menu), 15 carry three, one carries four; 16 have a criterion carrying two.
   So "prefer a criterion nothing has probed yet, second probe on a criterion only when nothing else
   is uncovered" is a real path with real fixtures, not a defensive branch.
4. **A criterion goes without a probe only when the opening asks that criterion and nothing else**
   (pilot rule, 2026-09-23). So "a criterion with no probe" is a normal state in the coverage log —
   exactly one per question, the one the opening asked — not an anomaly to report.
5. **A probe must not name what its criterion scores** (backend retrofit, 11 of 70 probes rewritten
   on it). That is a constraint on `interview_followup.v1.md`: the model adapts the connective
   tissue and **never adds specifics or examples**, because a leading follow-up is a gift to
   precisely the candidate who had not earned it.
6. **Backend at intern-junior is 18 questions (14 general).** With the "exclude the last 3 sessions"
   rule and ~4 questions a session, the least-recently-seen fallback is that audience's **normal**
   path by the fourth session, not an edge case. It is tested against the real corpus, not a fixture.
7. **Five of the eight role × level combinations have no track.** Nothing in M3 needs one — an
   interview does not read lessons — but the completion screen must not promise a study plan.
8. **`SessionTurn.follow_up_index` became load-bearing for an M4 content decision** ("needed no
   prompting", closing handover §3). It records _which_ probe, and `criteria_covered` records
   whether a criterion was covered unprompted.
9. **`review-doc.ts` keyed a Map on `criterion`** and silently dropped the second probe when the cap
   moved to two. The engine builds per-criterion maps in three places; none of them may key probes
   by criterion.
10. **The ADR is 0016.** The plan's Files list still names `0015-interview-transport-and-streaming.md`;
    0015 is roles-levels-stacks. Phase 3 of the same plan and `docs/PROMPTS.md` already say 0016.
11. **`senior` exists as a draft level no role offers.** Setup reads the published catalogue, so it
    cannot be chosen — with a test, because the failure is silent.

### Decisions taken at the start of this branch (engineering, recorded not asked)

- **Coverage is judged against the probes, never against the rubric.** One structured call per
  candidate answer: the opening prompt, the answer wrapped by `as_data`, and the probes with their
  criterion positions; out comes `already_answered` + a one-line reason per probe. Code then picks.
  This is what keeps the rubric out of every interviewer-model call while still producing a
  per-criterion log. Sending criterion text instead would put a readable answer key in every turn.
- **`criteria_covered` records one entry per rubric criterion position**: `has_probe`, `covered`
  (`true|false|null` — `null` means "no probe, so nothing judged it"), and the `follow_up_index`
  chosen, if any. The criterion the opening asked is the `null` one. It is never a score.
- **`max_follow_ups` stays 2 and every follow-up comes from the menu.** The pilot left open whether
  the engine should keep a slot for a free-form probe at a vague answer; it should not — an invented
  probe is the thing the retrofit removed. Revisit in M4, with sessions to look at.
- **Two model calls per candidate answer** (coverage, then phrasing), sequential. Text mode has no
  sub-second budget; M5's voice path revisits it.
- **The browser reads the SSE stream with `fetch` + a `ReadableStream` reader, not `EventSource`** —
  the route is a POST with a body and a session cookie. The generated api-client does not model
  streaming responses, so the one hand-written client module is `lib/interview-stream.ts` and the
  OpenAPI document declares the route as `text/event-stream`.

### Phase 1 — contracts, schema, sessions and selection (API only, no LLM) · **done 2026-09-25**

Handover: `docs/progress/2026-09-25-m3-phase-1.md`.

- [x] `packages/shared-types/src/contracts/interviews.ts` + `constants.ts` (states, lengths, budgets,
      `MAX_FOLLOW_UPS`); `InterviewSessionBundle` registered; `pnpm gen:contracts` committed
- [x] Prisma: `InterviewSession`, `InterviewSessionQuestion`, `SessionTurn`; one migration —
      `DROP INDEX questions_embedding_hnsw` deleted from it for the **fifth** time, no `DROP COLUMN`
- [x] `InterviewsModule`: create / list (keyset) / get, candidate shapes, `ApiError` codes
- [x] `session-bundle.ts` — `snapshotOf` pins it, `bundleQuestion` and `candidateQuestion` are the
      only doors out, with a marker test on each
- [x] `question-selection.ts` — pure, seeded, reusing `stackFilter`; 11 unit tests including five
      consecutive sessions against the **real** backend intern-junior corpus
- [x] Rate limits (6/h, 20/day) and the documented M8 entitlement seam
- [x] Stale-session sweep → `abandoned` (`stale-sessions.queue.ts`, every 10 minutes)
- [x] The pinning test, **watched failing on both halves**, and the leak test widened to
      `/api/interviews/` with its own control
- [x] Fold the amendments into `docs/plans/m3-interview-engine.md`

Three things phase 1 added that the plan did not have:

1. **`interview_sessions.catalogue`** — the slugs and names as they read at session time. A version
   pins what the content _said_, not what the row was _called_, and the plan's own acceptance
   ("rename the role afterwards; the report still says what it said") could not pass without it.
2. **The bundle carries no rubric.** The plan's architecture paragraph said "the pinned questions
   with their rubric criteria", written before the planned-follow-up decision and contradicting it.
   `BundleQuestion` carries `criterion_count` instead — enough to log coverage per criterion,
   not enough to score.
3. **Interviews are in the data export** (ADR-0011): the transcript and the questions as asked,
   without `follow_up_index` or `criteria_covered`, which are positions in a rubric the export does
   not contain. Worth a second look if the owner disagrees — it is the one judgement call here.

And one pre-existing bug fixed on the way, because M3's schema change made me drop `readi_test` and
a warm database had been hiding it since M2.5: `content-seed.int.spec.ts` named `frontend` and `mid`
in a seed directory that defines neither, so **13 tests failed on any empty database** — which is
what CI creates. Confirmed identical on `main` in a worktree before changing anything. The fixture
mints its own role and level now; the whole API suite passes on a freshly created database.

### Phase 2 — the engine in the worker · **done 2026-09-25**

- [x] `machine.py` — pure transition table, `now` passed in, 29 unit tests; `budgets.py` with the
      three reserves (a question 120 s, a follow-up 45 s, their own questions 90 s)
- [x] Probe selection as a pure function (`probes.py`), with the two-probe-on-one-criterion shape as
      a fixture, and the per-criterion coverage log built from per-probe verdicts
- [x] **Eight** versioned Jinja2 prompts, not five (see below); candidate text wrapped by `as_data`;
      the follow-up prompt receives the chosen probe and the answer and **no rubric**
- [x] `calls.py`: coverage judgement and phrasing, schema-validated, ≤2 retries, never on refusal,
      and a **fallback to the pinned wording** so a failing provider does not end the interview;
      `LLM_MODEL_INTERVIEWER=claude-sonnet-5`
- [x] Redis state store with TTL (`INTERVIEW_STATE_TTL_S`, default 2 h) caching the bundle; the
      interview-aware fake (`fake_script.py`), with a test that renders every prompt and asserts the
      fake still recognises it
- [x] The cross-language `InterviewAdvanceRequest` / `InterviewAdvanceResponse` contract and
      `POST /interview/advance` (phase 3 calls it; the worker cannot have a router without it)
- [x] Prompt-injection tests: all four named injections, plus "the model cannot end the interview by
      saying so" and "the candidate never appears outside a data block" over the real prompts
- [x] The free latency savings from the plan, as one rule in one place (`probes_to_judge`)

Six things phase 2 decided or added that the plan did not have:

1. **The snapshot in the request is the authority; Redis caches the bundle.** The plan said the
   bundle is sent "on the first call or after a Redis miss", which the API cannot detect — so the
   worker answers `bundle_required` and the API resends. And where the two disagree the request
   wins, because the API's copy is what has actually been **persisted**: replaying a response that
   reached Redis but not the database is right, and skipping ahead would leave a hole in the
   transcript. That also made **an exchange all-or-nothing** (no turns and a null snapshot on an
   error), which removed the need for a `resume` action.
2. **`coverage` is its own `AiCallPurpose`** (one migration, `ALTER TYPE … ADD VALUE`). Folding it
   into `follow_up` would have merged the call that is skipped with the call that is not, in the one
   table that answers "what does the follow-up machinery cost".
3. **A model that will not answer falls back to the pinned wording.** A question falls back to its
   own prompt, a follow-up to its own probe, the close to a fixed line — all staff-written, all
   already on the wire. The one call with no honest fallback is answering a question the _candidate_
   asked, and that is the only thing that returns `llm_error`.
4. **The intro is rendered, not generated**, and **the coverage call needs two prompts of its own**
   — hence eight prompt files rather than five. The intro carries the facts (length, question count,
   that skipping and ending early are allowed) and is the turn where the candidate is watching an
   empty screen.
5. **Coverage is tracked per probe, not per criterion** (`probes_covered` replaced
   `covered_criteria` in the snapshot before anything was built on it). Two probes on one criterion
   ask separable things, so an answer can reach one and not the other; criterion-level bookkeeping
   would either re-ask what was answered or drop what was not. Per criterion is still how the
   **log** reads — `coverage_log` is where the two views meet.
6. **The migration guard the owner asked for exists**: `apps/api/src/prisma/migration-sql.spec.ts`,
   offline, in `pnpm test` and CI. Prisma proposed `DROP INDEX questions_embedding_hnsw` for the
   **sixth** time in this phase's one-line enum migration, which is what made writing it easy to
   justify. Watched failing on both halves (the `DROP INDEX` and a `DROP COLUMN` under
   `tracks_one_published_per_role_level`) before being kept.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` clean; `pnpm test` green —
**427 API · 120 web · 95 shared-types · 178 Python · 56 ui · 3 api-client** (Python was 77).
`pnpm test:e2e` still belongs to phase 6.

### Phase 3 — wiring · **done 2026-09-25**

- [x] **The stream proved first**, before anything depended on it: `scripts/sse-rewrite-proof.mjs`
      runs a stub origin behind a production `next start` and times the frames through `proxy.ts` and
      the rewrite. Five frames 300 ms apart arrived at 330/625/926/1226/1527 ms, no `content-length`,
      `transfer-encoding: chunked`. Committed, because a Next upgrade could change the answer
- [x] `advanceInterview` on `AiWorkerClient`; `AI_WORKER_TIMEOUT_MS` re-checked — and the real fix
      was on the **worker** side: `INTERVIEW_LLM_TIMEOUT_S` (45 s) bounds an interview call far
      tighter than `LLM_TIMEOUT_S` (90 s, right for a CV in a background job), so two chained calls
      fit inside 150 s with room for a retry
- [x] The SSE route and its frame contract (`InterviewFrame`: thinking / turn / question / state /
      error / done), validated on the way out; `INTERVIEW_SSE_HEARTBEAT_MS`
- [x] Idempotent turn persistence by `(session_id, seq)`; `asked_at` and `follow_ups_asked` derived
      from the transcript; `ai_call_log` rows carrying the session id; `prompt_versions` merged and
      `model_config` taken from what was actually called
- [x] The Redis-miss round trip (`bundle_required` → resend the bundle); end-early; the expired
      session refused past its resume grace
- [x] A Redis lock per session (`interview_busy`), because a double-tapped send button would
      otherwise collide on `(session_id, seq)` and read as a 500
- [x] `GET /api/interviews/{id}/status` for the completion screen (`feedback_ready` always false in
      M3, deliberately)
- [x] **ADR-0016**, and `docs/PROMPTS.md`'s "stream interviewer text" corrected in the same change

Three things phase 3 decided or found that the plan did not have:

1. **A model that will not answer does not end the interview** (built in phase 2, wired here): the
   API sees a normal exchange with `status: "error"` calls in `ai_calls`. Only an unreachable worker
   or a refused exchange produces an `error` frame, and neither persists anything.
2. **The leak test's rule about planned follow-ups had to be narrowed, and it caught it.** M3 phase 3
   is where a route first _speaks_ a probe, so "never, anywhere" stopped being true — the test failed
   on the fixture's own marker. It now asserts a probe appears **only** inside the text of a turn an
   interviewer has spoken, counted, and nowhere else in any payload. That is stronger than the old
   rule everywhere except the one place it was wrong. `plannedFollowUpMarkers` is its own list on the
   fixture now, and CLAUDE.md §5 says so.
3. **The API has no per-criterion view at all**, which is the API's answer to the `review-doc.ts`
   bug: the coverage log arrives whole from the worker and is written whole, asserted byte-for-byte.
   The three real ones were audited — `probes.py` (a list), `review-doc.ts` (grouped, with a test for
   two probes on one criterion), `check-bank.mjs` (a count) — and `test_interview_probes.py` now
   holds the general form: every probe reachable, one log entry per criterion.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm check:contracts` clean;
`pnpm test` green — **471 API · 120 web · 95 shared-types · 180 Python · 56 ui · 3 api-client**.
`pnpm test:e2e` belongs to phase 6. No paid provider call yet: the owner's word is given for **one
15-minute diagnostic on `claude-sonnet-5` after phase 4**, in the browser, with the cost reported.

### Phase 4 — the web

**Start here: `docs/progress/2026-09-25-m3-phase-4-primer.md`** — the frame contract, the client
module, the status and candidate shapes, and the Margin rules for the interview screen, gathered so a
fresh session does not have to reconstruct them.

- [x] Practice list + setup (published catalogue, defaults from the profile, types from the role's
      `supported_question_types`); the variant picker's "not listed" path (**owner decision 3**)
- [x] The interview screen at 360px — serif interviewer, ruled candidate rail, wall-clock timer,
      pinned composer, `sessionStorage` draft, `role="status"` composing region
- [x] End-interview confirm (the `transition-panel.tsx` two-click pattern), completion/processing
      screen that promises scoring in M4 and **not** a study plan (item 7)
- [x] `/home` diagnostic CTA alive; the phone tab bar (Home, Practice, Profile); `proxy.ts` matcher
- [x] `interview-errors.ts`, the `interview` i18n namespace
- [ ] **Owner: a look at the interview screen at 360px** (screenshots taken 2026-09-25, light and
      dark, in `screenshots/m3-phase4/`) — then the handover, then the one paid diagnostic

#### Decided while building it

1. **Where the "what do you actually use?" answer lands: the profile's `technologies`** (the
   primer's open question, "a profile field vs. a table we read"). It is already the field that
   means "free text describing what the candidate knows", it is already readable — the query is
   profiles with `target_stack` null joined to their `technologies` — and it needs no API change,
   no migration and no new contract. The setup screen merges what is typed into the existing list
   through `PUT /api/me/profile`, **best effort and before the interview call**: it is a note to us,
   so a profile that refuses the update must not stop the interview starting.
2. **The meter on the grey bar tracks time, not the question count.** The time budget is the
   authoritative one (CLAUDE.md §5), and its accessible name says "minutes" so the two numbers
   beside it cannot be confused. The count is in words next to it, which is what keeps colour from
   being the only signal (ADR-0013).
3. **A new question starts a new section, marked by a hairline rule.** Without it the intro, the
   first question and the answer beneath it read as one column and "which of these am I answering"
   becomes work. A follow-up carries no rule: it belongs to the question above it.
4. **The completion screen reports the time the session actually took**, not `planned_minutes`.
   The first capture said "4 of 4 questions in 15 minutes" about an interview that took six.
5. **The draft and the clock are external stores, not effects.** `useSyncExternalStore` over
   `sessionStorage` and over one shared ticking clock — which is what the React Compiler lint rules
   push towards, and it removed the second copy of the draft rather than just moving it.
6. **`agentRules: false` in `next.config.ts`.** Next 16 writes an `AGENTS.md` and a `CLAUDE.md` into
   `apps/web` on every `next dev`; a generated `apps/web/CLAUDE.md` is loaded as project
   instructions and would quietly compete with the one we maintain at the root.

### Phase 4.5 — what the paid run showed (2026-09-26)

The first paid run (`docs/progress/2026-09-25-m3-paid-run.md`) produced zero follow-ups and openings
that asked three or four things at once. Re-diagnosed from the database on 2026-09-26: **one root
cause**, the dev database holding pre-retrofit _published_ rows that the importer was correctly
refusing to update (ADR-0014 decision 5), so the session pinned three-ask prompts with an empty probe
menu. The engine did exactly what it was designed to do with an empty menu. The earlier note's third
cause — "the openings ask what the probes were written to ask" — was a misdiagnosis: it compared the
new probes against the _stale pinned_ opening, and against the live one-ask opening they are
complementary.

- [x] **A. The coordinated second ask.** Ten openings still hang a second ask off the first with an
      explicit coordinator ("…what the check does, **and what it does not do**"). A new error in
      `check-bank.mjs` catches it; the token counter cannot (it reports >1 for 56 of 104, mostly
      relative pronouns), the coordination detector is clean on 93 of 104 with 10 of 11 flags
      genuine. Rule into `SKILL.md`; rewrite the ten; re-import
- [x] **B. "Never add an ask" as an enforced invariant.** A runtime guard compares the asks in the
      spoken turn with the asks in the pinned prompt; more is invalid output — retry, then fall back
      to the pinned wording, which already exists. Robust because it is a _relative_ count over
      near-identical text, so the counter's false positives cancel. Same guard on the follow-up call.
      `asks.py` in the worker, shared test vectors so the JS and Python copies cannot drift.
      `interview_question.v2.md` states the rule
- [x] **C. Stale published content in dev.** `pnpm db:seed -- --check` exits non-zero on drift; a
      warning at session creation when a pinned question has no probes and more than one criterion
- [x] **D. `interview_intro.v2.md`.** "nothing to look up and nobody else is listening" is untrue —
      the transcript is stored, and `complete.scoring` on the very next screen already says so. What
      v2 may say is bounded by two facts: cohort seats make progress "visible to the program"
      (spec §27) and the employer talent pool is opt-in [P3] (spec §127). See the M4 blocker above
- [x] **E. `interview_candidate_questions.v2.md`** — warmer. It read like a form because the prompt
      is almost all prohibitions; warmth comes from answering generously, not from praising the
      question, and the ban on "great question" stays
- [x] **F. Varying the transitions.** Each phrasing call is independent, so the model cannot know it
      already said "Let's move on". The engine supplies the connective, chosen deterministically from
      `(session_id, position)` so it varies within and between sessions and stays reproducible
- [x] Free proving run on `LLM_PROVIDER=fake` with deliberately thin answers — session
      `8643fee0-5661-4e1f-84b5-952ae1c2e982`: a thin answer drew two probes and stopped at the cap, a
      complete one drew none, and the coverage log carries real verdicts. Written up in
      `docs/progress/2026-09-26-paid-run-fixes.md`
- [ ] **The owner's second paid run.** Not armed: the worker is running the new code on
      `LLM_PROVIDER=fake`. The checklist is at the end of the fixes note
- [ ] **A known flake, left deliberately:** `interviews-advance.int.spec.ts` › "refuses a second
      exchange while one is in flight" failed once under full-suite load and passes alone. It races
      two `Promise.all` requests and needs them to genuinely overlap; on a loaded machine the first
      acquires and releases the Redis lock before the second arrives and both get 200. The fix is in
      the fixture — have the fake worker hold the exchange open — not in the test

### Phase 5 — Langfuse (ADR-0008)

- [ ] Tracing behind the env check, with a test proving it is off without keys; masking hook
- [ ] `langfuse_trace_id` on `AiCallRecord` → `ai_call_log`; retention sweep; erasure reaches it
- [ ] `docs/privacy/subprocessors.md`

### Phase 6 — verification and docs

- [ ] e2e interview spec; `slow-network` and `visual` suites extended (and the skipped specs grepped
      for renamed fields, per the M2.5 lesson)
- [ ] ~~One real 15-minute diagnostic against `claude-sonnet-5`~~ — **moved to the end of phase 4**
      (owner, 2026-09-25): they want to sit through it in the browser rather than read a transcript.
      One 15-minute diagnostic on `claude-sonnet-5`, announced before it runs, with the cost reported
- [ ] The pinning test watched to fail; a Redis flush mid-session followed by a resume
- [ ] `CLAUDE.md`, the corrected M3 prompt in `docs/PROMPTS.md`, the handover, lessons

### The owner's three decisions, taken 2026-09-25 at the start of this branch

1. **The coding round stays [P2].** M3 ships the prose interviewer. The carried-forward item is
   closed: Judge0/a sandbox is infrastructure we do not run, Monaco is the heaviest thing we could
   put on a mobile-first product, and M4's evaluator is being built around prose answers. What this
   buys is an obligation, not a free pass — the setup screen and the completion screen say what this
   interview covers and what it does not, because a product that prepares two rounds of three must
   not imply it prepares three (product principle 1).
2. **15 and 30 minutes only, as planned** — but for a new reason, which goes in the plan document.
   The old reason (the bank is too small) is dead. The live one is that nobody has typed an answer
   into this thing yet, so a 45-minute question budget would be a guess. It is one constant; M4's
   sessions size it.
3. **"Not sure yet" is explained, and asks.** No third state. The setup screen says what the choice
   buys — general questions for the role, because the stack-specific ones need a variant we offer —
   and a free-text "what do you actually use?" that **never touches eligibility** lands somewhere we
   can read, because the right answer to a missing variant is usually to add the variant. Where it
   lands is a phase-4 question (profile field vs. a rows-we-read table); the constraint is that it
   is not a selection input.

4. **The candidate's own questions are answered, not scored.** `CANDIDATE_QUESTIONS` answers in
   character and stops there — no score, no rubric, nothing in the report — so spec §4.3's
   "lightweight feedback" becomes a **lesson** in M7 rather than a rubric. Recorded in the plan as
   "Carried forward, answered" decision 5, because phase 2 writes
   `interview_candidate_questions.v1.md` to it: it answers, it does not assess, and its turns carry
   no `criteria_covered`. The carried-forward M7 item stands — role-agnostic content still has no
   home, since `Track` is keyed by role and level — with its shape now settled.

Still needed from the owner, at the phase that needs it: Langfuse keys before phase 5; the word
before the one paid end-to-end run (≈2–4¢); a look at the interview screen at 360px after phase 4.

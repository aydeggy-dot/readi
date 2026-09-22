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
- **Removing a level or a stack from a role silently invalidates the profiles that chose it.**
  Retiring is refused while something uses it; un-linking is a plain content edit with no check. The
  candidate keeps a `target_level_id` the catalogue no longer offers, and finds out only when they
  next save their profile and are made to re-pick a level they never changed. Is un-linking supposed
  to be refused like retiring, or to migrate the affected profiles, or to be allowed with a warning
  that says how many candidates it will affect? A product decision, not a bug fix.
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

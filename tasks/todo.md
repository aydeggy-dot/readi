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
- [x] **The owner's second paid run** — 7.8¢, `8fbddf78-2fde-45d6-9ef1-9bb4bd3b4724`, written up in
      `docs/progress/2026-09-26-m3-second-paid-run.md`. The design happened: follow-ups fired on real
      gaps and quoted the candidate back. Four findings, all fixed except the one that needs an admin:
  - [x] A **cut question was still published** and got asked (`api-error-shape`, cut 2026-09-25, no
        probes, two-ask opening). The importer never deletes, by design — so `db:seed -- --check` now
        reports published rows no seed file defines any more, which it could not see before because
        drift was measured only over rows the files name
  - [ ] **Retire `api-error-shape` and `api-error-contract` in /admin/content** — **the owner is doing
        this** (2026-09-26). Left for them: a transition is an audited act and SQL would bypass the
        trail. `--check` fails until it is done and goes green after, which is the check working
  - [x] Two **asymmetries in the ask counter** made the guard reject faithful rephrasings and fall
        back to the pinned wording, which is why two questions arrived with no connective: `whom` was
        not counted and `whether` was. Both fixed in both implementations, measured over the corpus
        (no floor break), with the asymmetries as named vectors
  - [x] The **fallback now carries the connective**, so a rejection no longer makes the interview
        lurch, and a rejected phrasing is in `ai_call_log` as `rejected_added_ask` rather than being
        findable only by noticing a question spoken verbatim
  - [x] `interview_candidate_questions.v3` — the "no real company behind this" disclaimer moves to the
        invitation, which is spoken once. v2 had it in front of every answer because every call is
        told to disclaim and no call can know it already has
- [x] **`api-list-that-grew`'s "What is going wrong, and for whom?" is an accepted exception to the
      one-ask rule** (owner's decision, 2026-09-26): one diagnosis with two sides rather than two
      questions, and it produced one of the two best follow-ups of the paid run. The question stays as
      it is and **no code changes** — `check-bank.mjs`'s coordinated-ask rule does not flag it and is
      not being widened to (the `for` intervenes and `whom` is not in its trigger list), which is the
      rule's deliberate narrowness earning its keep. The runtime counter reads it as two asks, which is
      the right ceiling for the guard. **The exception is the shape, not the wording**: one question,
      one criterion, two sides a candidate answers in one breath — not licence for a second clause
      asking a second criterion, which stays an error. Recorded in
      `docs/progress/2026-09-26-m3-second-paid-run.md` §5.2, not in the question's `reviewer_notes`,
      because it is a decision about a rule rather than about that question's content
- [x] **`LLM_PROVIDER=fake` is the default in `apps/ai-worker/.env` and `.env.example`** (owner's
      decision, 2026-09-26), so a plain `pnpm dev:worker` is never paid by accident. A paid run is
      armed on the command line for the length of that run; `ANTHROPIC_API_KEY` stays in `.env`, and
      `Settings` forbids `fake` in production. This inverts the warning in the two earlier notes, which
      are superseded rather than edited
- [ ] **A known flake, left deliberately:** `interviews-advance.int.spec.ts` › "refuses a second
      exchange while one is in flight" failed once under full-suite load and passes alone. It races
      two `Promise.all` requests and needs them to genuinely overlap; on a loaded machine the first
      acquires and releases the Redis lock before the second arrives and both get 200. The fix is in
      the fixture — have the fake worker hold the exchange open — not in the test

### Phase 5 — Langfuse (done, 2026-09-26; handover `docs/progress/2026-09-26-m3-phase-5.md`)

- [x] Tracing behind the env check, with a test proving it is off without keys; masking hook
- [x] `langfuse_trace_id` on `AiCallRecord` → `ai_call_log`; retention sweep; erasure reaches it
- [x] `docs/privacy/subprocessors.md`, and `docs/runbooks/langfuse-enable.md` for the day keys exist
- [ ] **Waiting on keys, and only this:** one trace inspected for ids-only, one masked prompt
      confirmed, and deletion by `user_id` and by age verified against the real service. The
      kickoff item "verify retention and bulk trace deletion" stays open until then — the code is
      built, tested and disabled, and no test can prove a third party deletes anything

### Phase 6 — verification and docs (done, 2026-09-26; handover `docs/progress/2026-09-26-m3.md`)

- [x] e2e interview spec (`apps/web/e2e/interview.spec.ts`); `slow-network` and `visual` suites
      extended — and the skipped specs did rot exactly as the M2.5 lesson predicted, in a way a
      grep would not have caught: the visual capture had been photographing `content.spec.ts`'s
      leftovers because **nothing publishes a question in a fresh e2e database**
- [x] ~~One real 15-minute diagnostic against `claude-sonnet-5`~~ — done twice at the end of phase 4
      (`2026-09-25-m3-paid-run.md`, `2026-09-26-m3-second-paid-run.md`), 4.2¢ and 7.8¢
- [x] The pinning test watched to fail — **both halves**, the snapshot and the catalogue rename,
      each by mutating the production code and reverting it; a Redis flush mid-session followed by
      a resume, now a permanent step in the e2e spec rather than a one-off
- [x] `CLAUDE.md` (the e2e database's two traps), the corrected M3 prompt in `docs/PROMPTS.md` (it
      still said "phrase the intro/transition naturally"), the handover, two lessons
- [x] Found and fixed on the way: the exchange lock was released **after** the stream closed, which
      is what the "known flake" really was; and "You answered 1 of 4 questions in 1 minutes"

### Carried out of M3, small

- [ ] **`measure()` in `slow-network.spec.ts` can report a negative duration.** The M3 phase 6 run
      printed `CMS question form: -123 ms, 310 KB`, and the interview screen's 1221 ms is the same
      effect in a milder form: the helper times `page.goto` with `Date.now()`, and on a route the
      browser has already prefetched (Next's `<Link>` fires `?_rsc=…` after `load`) the navigation
      resolves against work that started before the clock did. **The weights are unaffected** — they
      come from `performance.getEntriesByType`, which is why the budget assertions still mean
      something — so this is about the printed timings, which are the part a person reads. Fix it
      by measuring from the navigation entry (`startTime` to `loadEventEnd`) rather than wall clock,
      and by clearing the cache between pages; whoever next touches that spec should do it.

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

Still needed from the owner: **Langfuse keys**, whenever they want tracing on — phase 5 shipped
without them, correct and disabled, and `docs/runbooks/langfuse-enable.md` is the ten minutes it
takes. The paid end-to-end run and the 360px look are both done (two runs, `2026-09-25-m3-paid-run.md`
and `2026-09-26-m3-second-paid-run.md`). What is left for the owner before phase 6 is retiring
`api-error-shape` and `api-error-contract` in the CMS, which `pnpm db:seed -- --check` still fails on.

## M4 — evaluation, the session report, the eval harness, calibration (branch `feat/m4-evaluation`, from `main` at `3c91422`)

Plan: `docs/plans/m4-evaluation.md`. The owner's eleven decisions are recorded there, taken
2026-09-26 before any code was written.

### Phase 0 — the blocker: staff reading transcripts · **done 2026-09-26**

- [x] `transcript_review` in `CONSENT_TYPES` / `CONSENT_VERSIONS`; it **joins `allDecided`**, so
      every existing account is asked once
- [x] **A Prisma enum value, so it needed a migration** — `ConsentType` is a database enum, which the
      plan had not accounted for. `20260926223512_consent_transcript_review`, and it proposed
      `DROP INDEX questions_embedding_hnsw` for the **seventh** time, in a migration that touches
      nothing but an enum
- [x] `consent.types.transcript_review.v1.{title,body}` copy; both consent screens pick it up from
      `CONSENT_TYPES`, so neither form changed
- [x] `interview_intro.v3.md` — one conditional clause; the boolean is on the **bundle root**, not
      `InterviewCandidateContext` (it is not context a model may act on), and it is read when the
      bundle is built rather than pinned, because `session_turns` already records what was said
- [x] `docs/privacy/subprocessors.md`: the calibration reviewers, **and the stale Anthropic row** —
      it had described CV parsing alone since M1, and candidate answers have gone there since M3
- [x] ADR-0017 — the lawful basis, what the consent does not permit, and the self-selection caveat
      the agreement metric now carries
- [x] `isCurrentGrant` as the one rule, with a truth table; `usersGranting()` filters the set through
      the same predicate rather than restating it in SQL; `hasGranted()` for the single-user check
- [x] The intro clause appears only with the grant (worker), and the bundle carries the real decision
      (API integration) — **watched failing** by hardcoding `false` in `bundleFor`
- [x] CLAUDE.md: the consent list, and that adding a type is three things plus a re-ask
- [x] **Answered 2026-09-26: contractors, so processors.** Recorded in `subprocessors.md` and in
      ADR-0017 decision 6 (amended in place while unmerged, as ADR-0014 did — the decision as written
      asked the question rather than answering it). `docs/privacy/reviewer-agreement.md` is the draft
      template, marked on its face as needing an NDPA-familiar lawyer before anyone signs
- [ ] **Gate on phase 6:** no real reviewer is given access until a reviewed, signed agreement exists.
      The tool is built and demonstrated against staff-authored answers until then, which is what the
      gold set is made of anyway, so nothing in the schedule waits on the paperwork

### Phase 1 — contracts, schema, `evaluationRequest()` · **done 2026-09-27**

- [x] `contracts/evaluations.ts` + `registry.ts` + `index.ts`; 47 JSON Schema definitions, Pydantic regenerated
- [x] `session-bundle.ts` gains `evaluationQuestion` / `evaluationTurns` / `evaluationRequest` — the
      **fourth** width, in the one place widths cross. It carries the rubric and **not** the weights
      (the roll-up is arithmetic, and a model told one criterion is 45% will skim the rest) and not the
      planned follow-ups (the probes that were asked are already in the exchange). Both asserted, and
      the weight assertion **watched failing** by spreading the snapshot's criteria
- [x] `EVALUATION_LIMITS`, `MAX_CRITERION_SCORE`, `EVALUATION_CONFIDENCE` in `constants.ts`
- [x] The evidence rule as a function, not a `.refine` (a refinement cannot reach Pydantic), with
      `src/evidence-cases.json` as the shared case set — `ask-vectors.json`'s precedent. **Its Python
      twin is phase 2**, and until then the file has one reader
- [x] Prisma `answer_evaluations`, `session_reports`, `calibration_scores` + three enums; one
      migration, read by hand — it proposed `DROP INDEX questions_embedding_hnsw` for the **eighth**
      time, in a migration that only creates tables
- [x] Erasure: `calibration_scores.expert_user_id` tombstoned (the measurement outlives the reviewer);
      the candidate's side cascades. A new guard walks **every** foreign-key path from each of the
      three tables to `users` and fails on any hop that is not `CASCADE` — with a planted
      counter-example, because every real path in this schema cascades and a walker that finds nothing
      would otherwise pass
- [ ] **Moved to phase 4** (`content-no-answer-key.int.spec.ts`: `idealPointMarkers`, asserted as a
      count): there is still no report _route_ — phase 3 stores the report, phase 4 serves it — so the
      markers would have no assertions to belong to. The shape decision is enforced in the contract
      (`CandidateCriterionFeedback` has no `description`, `levels`, `weight` or `position`) and now also
      over the assembled report: `report-assembly.spec.ts` asserts the exact five keys of a criterion's
      feedback, and `evaluations.int.spec.ts` checks every `ANSWERKEY-…` marker of the real fixture
      against the stored report

### Phase 2 — the evaluator in the worker · **done 2026-09-27**

- [x] `readi_worker/evaluation/` (`evidence`, `calls`, `service`, `router`, `fake_script`) +
      `evaluate_answer.v1.md` and its input template; `POST /evaluate/answer`, one answer per request
- [x] **Three gates in front of a stored score**, each with a corrective message a retry can act on:
      every criterion exactly once; every quote the candidate's own; and no level descriptor echoed
      into prose the candidate reads (the answer-key surface the leak test cannot see — a model's own
      words)
- [x] Evidence verification tolerant of **how** a candidate writes and strict about **what** they
      said: case, punctuation, curly quotes, a tidied plural, a corrected typo, a dropped filler all
      verify; a translation of Pidgin into standard English does not, and nor does a fabrication.
      Nine fairness cases and five strictness cases, all named
- [x] Unverifiable quote → dropped and `confidence` lowered one step per drop; a non-zero score left
      with nothing is the retry trigger. A **0 with** a quote is deliberately allowed — the
      confident, specific, wrong answer the descriptors were rewritten for
- [x] ≤2 retries on invalid output, never on a refusal; then the answer comes back unscored with a
      code, and the report says so for that question
- [x] Injection: seven payloads (plain, inside a code comment, a fake rubric update, claiming to be
      the interviewer, claiming to be staff, closing the data block, asking for the answer key) ×
      three layers. **And the boundary is a test, not a silence**: a model quoting the injection
      itself produces a real quote, so the score stands — that is the prompt's problem, `/evals`' to
      measure and calibration's to keep honest. The owner has since decided what to do about it: see
      "Decided for phase 3" below
- [x] The evidence rule's Python twin, held to the **same** `evidence-cases.json` as the TypeScript
      one (ADR-0003 decision 5). The file now has both readers it was written for
- [x] A fake evaluator that reads the real prompt and quotes the real transcript, so CI and e2e never
      call a model and never hide a broken verifier
- [x] `llm_model_evaluator` / `evaluation_llm_timeout_s` in `settings.py`, `.env.example`, `turbo.json`
- [x] Found on the way: `model_copy(update=...)` skips validation, so marking a record left a bare
      `str` in a root-model field that serialised correctly **by luck** and made Pydantic warn. Fixed,
      with the warning turned into a failing test
- [x] Found on the way: CLAUDE.md asked for evaluation "with low temperature", which current Claude
      models **reject** — they take no sampling parameters. Corrected in CLAUDE.md, and what actually
      holds a score still is written down where the constant would have been

### Decided for phase 3 (owner, 2026-09-27) — flag an answer whose evidence reads like an instruction

Phase 2's injection gate stops a model **inventing** evidence, and a test records the line it cannot
hold: if the model quotes the injection _itself_, the quote is genuinely something the candidate typed,
it verifies, and an inflated score stands. The owner's answer is not to try to score around it but to
**make it visible**.

- **Detect** instruction-shaped text in the evidence quotes that were actually stored — `award`,
  `full marks`, `SYSTEM:`, `ignore the rubric`, `as the interviewer`, and the like. The phrase list
  lives in one place with the payloads that motivated it, so adding a phrase and adding a test case
  are the same edit.
- **Flag the evaluation.** A column on `answer_evaluations` (so it needs a migration of its own —
  phase 1's is already applied). **It is not shown to the candidate and it does not change the
  score**: a flag is a reason for a person to look, not a penalty applied by a regex, and a candidate
  who wrote "ignore the rubric" inside an otherwise real answer has not earned a worse mark for it.
- **Surface flagged sessions to admins.** A list is enough — `/admin` already hosts staff screens, and
  phase 6's calibration area is the natural home, so the list may land there rather than in phase 3 as
  long as the flag is being written from phase 3 onward. Data with no reader rots; say which phase
  draws the list.
- **Test it with the seven payloads that already exist** (`test_evaluation_injection.py`): each one,
  quoted back as evidence by an obedient model, must set the flag — and the ordinary fixtures must
  not, or the list fills with noise and nobody reads it.

Open questions for whoever implements it: whether the flag is a boolean or the matched phrases (the
phrases are more useful to an admin and are our own words, not the candidate's, so they are safe to
store); whether the worker returns it on `EvaluateAnswerResponse` (it already holds the verified
quotes, so it is the cheapest place — at the cost of a contract field) or the API derives it from the
stored `criteria`; and whether a flagged session should also be excluded from the calibration sample
until a person has looked at it.

**Answered in phase 3 (2026-09-27):**

- **The matched phrases, not a boolean.** They are our own words, so they are safe to store and safe to
  put in front of an admin, and they say at a glance which shape of injection this was. The quote that
  matched them is the candidate's prose and is not copied anywhere — reading it still needs
  `transcript_review` (ADR-0017), and a flag list is not a way round that.
- **The worker returns it**, on `EvaluateAnswerResponse.evidence_flags`. It is holding the verified
  quotes at the moment they are decided, and — the deciding reason — the phrase list then lives beside
  the payloads that motivated it (`readi_worker/evaluation/instruction_flags.py` next to
  `tests/test_evaluation_injection.py`), which is what the decision asked for. The coverage test asserts
  **both** directions: every payload sets a flag, and every phrase is reached by some payload, so a
  phrase added without a case fails in CI.
- **Punctuation is kept** when matching, unlike `evidence.py`'s `normalise`. `SYSTEM:` is a phrase;
  `system` is a word most technical answers contain, and a list that flagged every answer mentioning a
  system would be read once and then ignored.
- **A flagged answer is not excluded from the calibration sample** — it is the most interesting answer
  in it. But the agreement metric has to be able to report **with and without** flagged answers, because
  a gamed score looks exactly like a miscalibrated evaluator until you separate them. That is phase 6's
  to build; the flag it needs is written from here on.
- **Phase 6 draws the list**, in the calibration area: `answer_evaluations` is indexed
  `(status, created_at)` for the sampler already, and a flagged-answers list is the same query with one
  more predicate. Until then the flag is also logged when it is set (phrases and ids only).

### Phase 3 — the job, the scoring rule, the report in code · **done 2026-09-27**

- [x] `apps/api/src/evaluations/` on the `cv-parse.queue.ts` pattern — queue, processor, repository,
      service and two pure modules. `EvaluationsModule` does **not** import `InterviewsModule`: the
      dependency runs the other way, and a cycle would be the engine and the scorer knowing about each
      other. What crosses is one pure function, `evaluationRequest()`
- [x] **Enqueued on all three doors to `ended`**, through one method (`onSessionsEnded`) and one rule
      (`endedWithAnswers`): the engine wrapping up, the candidate ending early, the stale sweep — **and
      a fourth the plan had not listed**, a candidate starting a new interview, which abandons the one
      they left. `abandonStale` and `create` both had to start returning ids instead of a count
- [x] **An abandoned session with answers in it is still scored.** Which door a session left through is
      invisible to the candidate, and "sometimes there is a report" is a worse product than one report
      per set of answers. It costs a paid evaluation for a session somebody walked away from, which is a
      real cost and is written down as one
- [x] A session with **no candidate turn** gets no job and no report — an honest empty state rather than
      a report reading "0 of 0"
- [x] **The enqueue is outside the SSE stream**, after `close()`. ADR-0016 says nothing between
      `open()` and `close()` may throw, and the first version put an awaited `queue.add` in there: BullMQ
      refused the job id (`Custom Id cannot contain :`) and every advance request 500'd **after** the
      candidate had already been sent every frame. Now it is after the stream, wrapped, and logged
      rather than raised
- [x] `scoring.ts`: weighted 0–100 + the 0.85 adjustment under `SCORING_VERSION`, on **any non-zero**
      score and on the **numerator only** (off both sides it would _raise_ a prompted criterion's
      contribution — the kind of arithmetic a candidate finds before we do). 14 unit tests, every number
      worked out in the assertion rather than copied from a run
- [x] **Two probes per criterion handled** — `prompting.ts` reads the pinned menu **per probe** and
      collapses to a set of criteria at the end, so a criterion probed twice is discounted once rather
      than 0.85². Keyed on `session_turns.follow_up_index`, the engine fact, and never on the coverage
      model's verdict
- [x] `report-assembly.ts`, pure: topic and question-type aggregates (weakest first — the top of the
      list is what a candidate acts on), top 3 strengths from the answers that went best and top 3 fixes
      from the ones that went worst, the per-question breakdown, the pinned ideal points as "what a
      strong answer covers", and the prompting counts as numbers the web turns into a sentence
- [x] **`TrackTopic` finally has a reader.** `lessonsForTopics` joins `TrackTopic.isCore` × `Lesson.topicId`
      through the published track for the session's role and level; core topics first. It returns nothing
      for five of eight role × level pairs, so the empty state is the part that ships
- [x] **Both** `weak_topics` seams filled, from one query: the bundle takes the topic **names** (the
      worker has no catalogue) and `selectQuestions` takes the **ids** (it is weighting a pool it holds).
      The second one was not in the plan's checklist and had the same "empty until M4" comment on it
- [x] The injection-evidence flag: `instruction_flags.py` beside the payloads, a column with its own
      migration (**the ninth** `DROP INDEX questions_embedding_hnsw`, in a migration that adds one
      column to a table Prisma has never heard of), stored, logged, and shown to no candidate. See
      "Answered in phase 3" above for the four open questions
- [x] `EvaluateAnswerResponse` also gained `prompt_versions`, which phase 2 had missed: the column is
      `NOT NULL` and there was nothing on the wire to fill it with
- [x] The pinning test extended to scoring and **watched failing in both halves** (2026-09-27) —
      the words (report assembled from the live `questions` row: prompt and ideal points moved) and the
      number (weights read from live `rubric_criteria`: 90 became 10). 547 other tests passed under the
      first mutation, which is the reason that file exists
- [x] **And the test was wrong the first time, which the mutation found.** Written as "score, then
      edit", it passed with the weights read live — because an answer that has a row is never re-scored,
      so the stale read never happened. It now edits the question and the rubric **mid-interview**, which
      is also the real sequence: a session lasts fifteen to thirty minutes and an expert can rework a
      rubric inside that window
- [x] An idempotent re-run (no model call, no second row), a failed answer (`status: failed`,
      `attempts: 3`, an honest gap in the report, the engine fact stored anyway), and the flag stored
      without moving the score — all in `test/evaluations.int.spec.ts`, against the real BullMQ queue

**Left for phase 4, found here:** a lost enqueue currently means a report that never arrives, because
the stale sweep only looks at `in_progress` sessions. `GET /api/interviews/:id/report` should queue one
when a completed session with answers has no report — the cheapest possible recovery, and it belongs
with the route rather than here.

### Phase 4 — the report the candidate reads · **done 2026-09-27**

- [x] Flip `feedback_ready`; replace `interview.complete.scoringTitle` / `.scoring`
- [x] `GET /api/interviews/:id/report`, and **re-queue on a miss**. Three codes rather than one,
      because the honest screen for each is different: `interview_not_ended` (409),
      `report_not_ready` (409, and the read queued one) and `report_not_found` (404 — nobody answered,
      so there will never be one)
- [x] **The report route reads the stored `summary` with `safeParse`, not `parse`.** It is the artefact
      a candidate was given, written by whichever release assembled it; a shape that has moved since
      must not 500 their report page. An unreadable one is treated exactly as a missing one — re-queued
      — and re-assembly is free, because every answer already has a row and is never re-scored
- [x] **A completed job blocks the re-queue, and that made the recovery a no-op.** The job id is the
      session id (so two doors closing at once enqueue one job), BullMQ keeps completed jobs
      (`removeOnComplete: { count: 1000 }`) and `Queue.add` with an existing id silently returns the
      existing job — so re-queueing a session it had already scored did **nothing**, the route answered
      "still being scored" for ever and the sweep queued into a void. `enqueue` now removes a
      **completed or failed** job under that id first and leaves a waiting, delayed or active one
      alone, which is where the dedupe was always meant to be. Found by the route test failing
- [x] **A periodic sweep for ended sessions with answers and no evaluation** (owner, 2026-09-27) —
      queueing on a report-route miss is not enough on its own, because **it only fires if somebody
      opens the report**. A candidate who never opens theirs would go unscored for good, and that is not
      only a missing page: `answer_evaluations` is what `weakTopics` reads, so an unscored session
      silently degrades the _next_ interview's question selection and interviewer context, and **M6's
      readiness score is computed from stored scores** — a gap there is a wrong number, not a blank one.
      So the scoring queue gets its own sweep, on the `StaleSessionsQueue` / `AccountErasureQueue`
      pattern: a scheduled job, over the **database** rather than a delayed job per session, so nothing
      is lost to a Redis flush and a failed sweep is retried by the next one. Its query is
      `endedWithAnswers` narrowed to sessions with no `answer_evaluations` row and no `session_reports`
      row — and it must **not** re-queue a session whose answers all came back `failed`, or it will pay
      for the same refusal every ten minutes for ever. Bound it (oldest first, a batch at a time) so a
      backlog cannot become a stampede of paid calls, and give it a test that plants an ended, answered,
      unevaluated session and watches it get queued.
      **The query turned out to be one predicate, and the trap answered itself**: "ended, answered, no
      `session_reports` row", oldest first, 20 at a time, 15 minutes' grace. It cannot pay twice for a
      refusal, and the reason is structural rather than a special case — `assemble()` stores a `failed`
      report even when nothing could be scored, so a refused session leaves the query for good; and an
      answer with a row is never re-scored, so a session that stored answers but not its report
      re-assembles for **no model call at all**. The only thing it can spend money on is a session that
      was never evaluated, which is exactly the lost enqueue
- [x] **The sweep returns ids, not a count.** Its first test asserted "nothing was swept" and failed
      against sessions other tests in the same file had left behind — the sweep reads the whole
      database and every spec in the suite shares one. An assertion that names its own session is the
      only kind that can be trusted here
- [x] `content-no-answer-key.int.spec.ts`: a **scored** session, run through the engine and the real
      queue, and the narrowed rule asserted as three separate claims — the unconditional key absent,
      the ideal points appearing exactly as many times as `strong_answer_covers` shows them, and a
      dimension appearing only as a criterion's `dimension`. Plus `allowKeys` on the detector for the
      three field names a report legitimately has (`criteria`, `criteria_total`,
      `criteria_volunteered`), with a control proving the allowance is doing something _and_ that a
      grafted rubric still fails with it in place
- [x] `content-fixtures.ts` gained `idealPointMarkers` and `dimensionMarkers` as **subsets** of
      `answerKeyMarkers` rather than as replacements: `interviews-advance.int.spec.ts` asserts the
      bundle carries none of the key, and that claim has to keep covering ideal points and dimensions
- [x] `(session)/interview/[id]/report/page.tsx`; 360px; **no client JavaScript on the route** — the
      report is text, bars and links, and the waiting belongs to the completion screen
- [x] Honest states: a failed answer (its own frame, and it still shows what a strong answer covers), a
      session where **nothing** could be scored (no number at all, never a 0), a session nobody answered
      (no polling — the transcript already says there is nothing to score), scoring that takes longer
      than three minutes (spec §8 wants 60 s; a spinner that outlives its job is the failure), and no
      published track (five of eight role × level pairs)
- [x] **The lessons are a reading list, not links.** There is no candidate-facing lesson page in the app
      yet, and a title that looks like a link and answers 404 is worse than one that admits what it is.
      Naming the lesson written for the topic somebody went worst on is most of the value; the day the
      page exists it becomes a list of links with no other change
- [x] **Contract: `strengths` and `fixes` carry the question they came from** (`ReportHighlight`).
      Chosen in code from the best and worst answers, so each is a claim about one specific answer, and
      without saying which, "say what you measured" is advice a candidate cannot check. They carry a
      **position, not a quote**: the quote belongs to a criterion, where the evaluator paired it with
      its own reasoning, and pairing a session-level tip with a criterion-level quote would assert a
      link nothing made. The summary attributes; the breakdown quotes
- [x] **Contract: the report carries the pinned catalogue and `ended_at`.** A report is read months
      later and CLAUDE.md's rule is that renaming a role must not rewrite one somebody has already
      read — so the names travel with the artefact rather than being joined at read time. `ended_at`
      because a report the sweep recovers days later must not date itself by its own assembly
- [x] The visual capture extended (`39-interview-report`), and `runInterview` now waits for the report
      through the candidate's own path — so screen 38 is photographed settled rather than mid-spinner

### Phase 4.5 — the first paid evaluation run (set up 2026-09-27, owner runs it)

One 15-minute interview on `claude-sonnet-5` with evaluation on `claude-opus-5`, before phases 5 and
6: the evaluator has never met a real model, and the report is only as good as what is in it.

- [x] `pnpm db:seed -- --check` — **clean**. 104 questions, 102 rubrics, 4 roles, all unchanged; no
      published row the files have stopped naming (the `api-error-shape` retirement held)
- [x] **The dev API is running pre-phase-4 code** — `/api/interviews/:id/report` answers 404 where
      `/status` answers 401, so the route is not there. It must be restarted before anything
- [x] **Ten ended sessions in the dev database have no evaluation and no report, and eight of them
      have answers.** The new sweep will queue all eight on the first tick after a restart — roughly
      30 evaluator calls, which is about **$1 on opus** and would land in the middle of the run being
      measured. So the order is: restart the API **while the worker is still `fake`**, let the sweep
      drain the backlog for nothing, and only then arm. It is also the first time the sweep runs
      against real rows, which is worth watching
- [x] **A startup line naming the armed provider** (`readi_worker/main.py`). `fake` is the resting
      state and a paid run is armed on the command line for its own length, so the one thing an
      operator needs before spending money is a way to tell the two apart from outside the process —
      and `.env.example` already recorded that the first two paid runs were each diagnosed twice
      partly because there was not one. Names only; the key is a `SecretStr`
- [ ] **The run**: `aydeggy5@gmail.com`, Backend · Mid-level, 15 minutes, the preset mixed types.
      That account has **no prior sessions**, so no question history to exclude and no weak-topic
      weighting, and it owns none of the backlog, so the fake scores cannot reach it
- [x] Costs reported **separately** (2026-09-27, session `742150d9`): interview **4.79¢** (14 calls,
      `claude-sonnet-5`), evaluation **23.38¢** (5 calls, `claude-opus-5`), **28.17¢** total. The
      evaluation is 83% of it and ~4.9× the interview — the plan projected ≈12¢ for four answers on
      opus and it came in at nearly double, on 4,350 input and 1,000 output tokens per call plus one
      retry
- [x] **The first paid evaluation worked.** Four answers scored, all `high` confidence, one retry on a
      `rejected_criteria` gate, no refusals, no provider errors, no evidence flags. The prompting
      discount is visible and small where it should be: 83→75, 85→82, 84→80, and 55→55 where nothing
      was prompted
- [ ] **A 15-minute session did not reach the candidate's own questions, and that is a real finding**
      rather than a bug. The four questions took 14m 35s of a 15m budget, the engine needs
      `SECONDS_FOR_CANDIDATE_QUESTIONS` (90) to open the state, and 25 seconds remained. **95% of the
      session was the candidate typing** (13m 51s of 14m 38s; the model spent 43s), and **question 1
      alone took 9m 12s** — a 236-second first answer and a 224-second answer to its second probe.
      The owner's call: is the 15-minute plan four questions or three, and should `INTERVIEW_PLANS`
      reserve the invitation rather than letting the question budget consume it? `interviews:pace` is
      the tool that should answer it with more than one session
- [ ] **`transcript_review` is never asked of an existing account** — see the blocker below
- [x] The worker disarmed back to `fake` after the run, confirmed by its own startup line
- [x] **Written up in full: `docs/progress/2026-09-27-m4-first-paid-evaluation.md`** — the session id,
      both cost tables, the per-answer table, the timing table, and the four findings below

### What the paid run found, for the next session to act on

**1. A candidate can lose 35 points to the clock, and nothing says so.** Question 4 scored 55 because
criterion 2 (35% — "Deals with the rows that are already wrong") scored 0 with no quotes. Its probe
existed and was **never asked**: `criteria_covered` is `not_judged` for all three criteria and there
is **no coverage call in `ai_call_log` for that question at all**. Three correct rules composed into
it — the engine opened the question with 127 s left (`SECONDS_FOR_A_QUESTION` is 120), the answer took
99 s, so at submission 25 s remained against `SECONDS_FOR_A_FOLLOW_UP` (45) and `probes_to_judge`
returned empty; and then the evaluator scored the whole pinned rubric, because it has no idea which
probes were asked. The 0.85 adjustment protects a candidate who **needed** a nudge and there is
nothing for one who was never **offered** one.

- [x] **Remedy (b), the guarantee — done first, `SCORING_VERSION` 2.** A criterion the interview
      never asked about **and** which the answer did not reach (0 with no evidence) leaves the
      denominator; volunteered unasked, or addressed and wrong, still scores. `unaskedCriteria()` +
      `notAssessedCriteria()`, keyed on the engine fact and the model's own reading, never on the
      coverage verdict. Never excludes the whole rubric. The report names them by `dimension` in
      `not_assessed`, and `criteria_total` is now the assessed count
- [x] **Remedy (a), the improvement — `SECONDS_TO_OPEN_A_QUESTION` (165 s).** End sooner with fewer
      questions rather than open one the clock cannot probe. The reserve now means what its own
      comment said; the 127-second case is a named test parameter
- [x] **The evaluator is told which criteria were asked** (`asked_about`, `evaluate_answer.v2.md`) —
      so its **prose** stops blaming a candidate for a question nobody put to them. It may not move a
      score, and does not: the exclusion is arithmetic in `scoring.ts`
- [x] **Tested on the real question 4**: 55 before, **85** after, `overall_raw` still 55; the session
      goes 73 → 81. Written up in `docs/progress/2026-09-27-fairness-and-cost-levers.md`

**2. Evaluation is 83% of the bill** — 23.38¢ against 4.79¢, **4.9× the interview**, where the M4 plan
projected ≈12¢. A 30-minute session (eight answers) is ≈50¢ of evaluation at this rate.

- [x] **Measured, not guessed.** The cacheable prefix is the **system prompt and nothing else** —
      render order is `tools → system → messages` and the user message diverges at its first
      interpolation. `evaluate_answer.v2.md` is 6,281 chars ≈ **1,700 tokens**, which is ~39% of the
      4,352-token average call. Saving: **2.84¢ cold (12.2%)**, **3.82¢ warm (16.3%)** of 23.38¢;
      identical percentages on sonnet-5. Minimum cacheable prefix is 512 tokens on opus-5 and 1,024
      on sonnet-5 — both cleared
- [x] **The prefix is global, not per-session**, so under any traffic at all the write amortises and
      warm is the normal case. A scheduled keep-alive is **not** worth it below ~9 sessions/day
      (a refresh is a cache read, ~$7.50/month)
- [x] **The fan-out fix is a `max_tokens: 0` pre-warm**, not scoring the first answer alone: same
      write, ~1 s instead of the measured ~15 s of latency against spec §8's 60 s
- [x] **Recorded with the sonnet comparison as M8 pricing inputs** —
      `docs/progress/2026-09-27-fairness-and-cost-levers.md`. sonnet-5 is 60%, caching 12–16%, they
      compose to 66%: 28.17¢ → ≈12.6–13.0¢ for a 15-minute session. A 30-minute session is ≈50¢ on
      opus, ≈16–17¢ on sonnet with caching
- [ ] **Not built.** Caching is a phase 7 change at the earliest, after the model decision — the
      percentage is the same either way, so there is nothing to learn by doing it first
- [x] One retry of five calls bought nothing (~4.7¢). That is the gates working, and it belongs in any
      per-session estimate
- [ ] **The larger caching opportunity is the interview, not the evaluator**: 14 calls sharing a
      system prompt _and_ a session bundle, sequential by construction so it needs no pre-warm. Worth
      only 12–16% of 4.79¢, so it is not urgent

**3. Four questions did not fit fifteen minutes** at this candidate's pace: 14m 38s used, **95% of it
the candidate typing** (13m 51s; the model spent 43 s), and **question 1 alone took 9m 12s — 63% of the
interview**. The candidate's own questions were then skipped with 25 s left against a 90 s reserve.

- [ ] One session is not a pace. `interviews:pace` (phase 7) reports median and p90 before anything
      changes. The options on the table: `INTERVIEW_PLANS[15].questions` from 4 to 3; reserve the
      invitation up front rather than letting the question budget consume it; or leave it and accept
      that a thorough candidate trades their own questions for a fourth interview question

**4. The consent-routing bug** — see the blocker below, unchanged by the run except that the run is
what exposed it.

### Blocker found by the paid run — the consent nobody is asked for (2026-09-27)

`transcript_review` joined `allDecided` in phase 0 so that "every existing account is asked once"
(ADR-0017). **It is not.** The owner's account has four consent records from 2026-09-19 and no
`transcript_review` row of either kind, and the interview intro correctly omitted the v3 clause
because `hasGranted` correctly returned false. Everything downstream of the decision works; the
decision is never requested.

The cause is one line. `nextOnboardingPath` (`apps/web/src/lib/navigation.ts`) routes on
`completed_at`, not on the value `allDecided` computes:

```ts
if (!state.profile_completed) return "/onboarding/profile";
if (!state.completed_at) return "/onboarding/consent"; // ← already set on 2026-09-19
return null;
```

`OnboardingService.state` does return `consents_completed: false`, and `complete()` refuses on it —
but nothing sends an account that has _already_ completed onboarding back for a new consent type.

- [x] **Fixed 2026-09-27 (phase 4.7), and it was not one line.**
      `docs/progress/2026-09-27-consent-routing.md`. `nextOnboardingPath` routes on
      `consents_completed`; **and the redirect loop was real** — the consent page bounced anybody with
      `completed_at` to `/profile/consent`, which is behind `requireOnboarded`, so with the one-liner
      alone every existing account would have ping-ponged between the two screens and been unable to
      load any page. Closed by extracting `consentStepPath()` as a pure function reading the _same_
      fact, with the invariant asserted over all eight states and a termination walk beside it — both
      watched failing with the bug put back
- [x] **Continue checked, not assumed**: prior decisions come back pre-ticked so nobody silently loses
      a consent; an unticked new type records an explicit `false`, which satisfies `allDecided`
      ("refusable at no cost"); and `complete()` is idempotent, so the onboarding-mode submit has no
      error path on an already-onboarded account
- [x] **No e2e spec depended on the old routing**, checked rather than reasoned:
      `pnpm test:e2e onboarding` passes on the new routing, including the whole sign-up → profile → CV
      → consent → home walk. `onboard()` clicks Continue with nothing ticked, which records an explicit
      `false` for every type and satisfies `allDecided`
- [ ] **No e2e test for the re-ask itself** — the state needs an onboarded account with an undecided
      consent, which means database surgery the e2e specs have no route to. Covered at the unit level
- [ ] **Phase 6 is unblocked but nobody has been asked yet**: `usersGranting("transcript_review")`
      returns nobody until accounts pass through the screen. The owner's account is the first, on its
      next page load
- [ ] **It gates phase 6.** The calibration tool samples through `usersGranting("transcript_review")`,
      which is correct and currently returns nobody — so the tool would be built against an empty set
      and look like it worked. Safe by default, useless in practice, and a promise in an accepted ADR
      that the product does not keep
- [ ] A test that would have caught it: `nextOnboardingPath` for a state with `completed_at` set and
      `consents_completed` false must not be null

### Phase 4.6 — the fairness fix, the reserve, and the caching measurement (2026-09-27)

The owner's decision on finding 1: **implement both**, the guarantee first. Full write-up in
`docs/progress/2026-09-27-fairness-and-cost-levers.md`.

- [x] `SCORING_VERSION` 2, `not_assessed_criteria` column (migration read by hand; Prisma proposed
      `DROP INDEX questions_embedding_hnsw` for the **tenth** time and it was deleted; applied with
      `migrate deploy`)
- [x] `unaskedCriteria()` — the exact complement of `promptedCriteria()` over the criteria that have
      probes, per probe and never per criterion
- [x] `notAssessedCriteria()` — the engine fact **and** the model's 0-with-no-evidence, with the
      "never the whole rubric" guard for the two seeded questions that probe every criterion
- [x] `asked_about` on `EvaluationCriterion`, `NOT_ASKED_LABEL`, `evaluate_answer.v2.md` (v1 is
      released and scored the paid run, so it was not edited; only that one entry of `PROMPT_VERSIONS`
      moved)
- [x] `not_assessed` on the candidate report, its own frame on the page, `criteria_total` narrowed to
      the assessed count; the leak test's dimension count now spans both lists
- [x] `SECONDS_TO_OPEN_A_QUESTION` in `budgets.py`, used by `_past_current_question`
- [x] Tests: the real question 4 in `scoring.spec.ts` (55 → 85), `unaskedCriteria` including the
      two-probe case, report assembly, the end-to-end case through the real queue
      (`FakeInterviewEngine.followUps`), the 127-second reserve, the worker's criteria block and v2
      prompt, the stand-in scoring a `NOT ASKED` criterion 0, and the web sentence
- [x] Lint, typecheck, 584 API + 349 worker + 168 web tests green
- [x] **`pnpm test:e2e` green** (2026-09-28, once WSL restarted and the dev servers were down):
      9 passed, 6 skipped — the opt-in visual and slow-network specs. It covers the interview but
      **not the report**; "e2e interview → report" is still owed by phase 7
- [x] **Every stored report is now unreadable to this release, and that is the designed path.**
      `not_assessed` is a required field, so `SessionReportResponse.safeParse` fails on the paid run's
      stored `summary` — which is exactly what `safeParse` plus the sweep exist for: the route answers
      `report_not_ready`, queues the job, and re-assembly **makes no model call** because every answer
      already has a row. The candidate sees the processing screen once. Deliberately not given a Zod
      `.default([])`: the contract is better required, and the recovery is free
- [ ] **But the 30 points are not given back to it.** An answer with a row is never re-scored, and
      re-assembly reads `not_assessed_criteria`, which is empty for rows written under
      `scoring_version = 1` — so the paid run's report re-assembles at 55 and 73. Re-scoring a session
      means deleting its `answer_evaluations` rows and paying again: an operator's call, and there is
      one real session it would apply to

### The intermittent API test failure — hunted, not caught (2026-09-28)

`docs/progress/2026-09-28-flaky-test-hunt.md`. **Twenty runs, no reproduction**, so the cause is
unconfirmed rather than explained.

- [x] 10 × the API suite alone, and 10 × `pnpm test --force` through turbo: all clean (588 each)
- [x] **The one lead**: all three failures happened while `pnpm dev` and `dev:worker` were up; all
      twenty clean runs happened with them stopped. On 6 cores and 7 GB — ~2 GB free _without_ them —
      six concurrent package suites plus the API's own four Nest apps is a materially different load
- [x] **The named suspect**: five specs polled a real background job with a hand-rolled 10-second
      budget that was never measured. Unified into `test/poll.ts` (`pollFor`,
      `BACKGROUND_JOB_BUDGET_MS = 25_000`, still under `testTimeout` so the poll names what it waited
      for), with `poll.test.ts` — seven cases, because a poll that returns too eagerly fails _silently_
- [x] **The first finding cost the most**: no test name was ever captured, because the grep matched
      turbo's counts and not its `×` lines, and ANSI codes defeated the pattern that would have. The
      write-up says how to capture it next time
- [ ] **Still possible it recurs.** The widened budget is a mitigation for an unconfirmed diagnosis. If
      it does, the four steps in the write-up say what to do, and the five polls now name themselves

### Phase 5 — the eval harness

- [ ] `readi_worker.evals.run` over the 510 synthetic answers; rubrics read from `content/seed`, no database
- [ ] The two separations and the `nigerian-english` one-point band, measured on the **real** evaluator
- [ ] `evals/datasets/gold/` format, `evals/thresholds.yaml`, a README that keeps synthetic and gold apart
- [ ] `--smoke` on the fake provider inside `pnpm test`, so the harness cannot rot
- [ ] `.github/workflows/evals.yml`, `workflow_dispatch` only, reason in the file

### Phase 6 — the calibration tool (done, 2026-09-28; handover `docs/progress/2026-09-28-m4-phase-6.md`)

- [x] **The gate is in code, not in a convention.** `CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS` is off
      and while it is, only **staff-written** answers are offered — so the whole path was built and
      demonstrated, consent and all, without one candidate's words reaching a reviewer. A test opens
      the flag and watches the same answer appear, so the gate is proved in both positions. Flipping
      it is the only change needed when a signed `reviewer-agreement.md` exists (ADR-0017 decision 6)
- [x] `/admin/calibration`: the queue, the answer with the **pinned** rubric and no AI marks, the
      flagged-evidence list, and agreement per rubric and per question. `calibration_scores` already
      existed from the phase 0 migration, already in `TOMBSTONED_COLUMNS` — **no migration was needed**
- [x] **Nothing is sampled except through `usersGranting("transcript_review")`.** Held in four
      directions: never granted, granted then withdrawn (the _read_ as well as the list, because a
      reviewer may hold a link), granted against an older version of the wording, and granted by
      somebody who is not staff while the gate is closed
- [x] **A read is the audited event**, not the score — consent was asked for a person _reading_ a
      candidate's words. One row per read, ids and counts only; a refused read writes nothing
- [x] **Blindness asserted over the raw JSON**, as the leak test does: `CalibrationAnswer` is a
      separate shape rather than an `Omit<>` of the evaluation, because a field omitted by subtraction
      comes back the first time somebody widens the parent. No name, no email, no user id either
- [x] **No second status machine**, which is what the plan's "reuse `content-workflow.ts`" was warning
      against: a review has no lifecycle. Nothing was bent to reuse it
- [x] The agreement dashboard is **admin-only and aggregate-only** — an aggregate a reviewer reads
      before marking is still the model's opinion reaching them first, and a row naming one answer
      would undo the blindness for everyone who has not marked it yet
- [x] `apps/web/e2e/calibration.spec.ts` at 360px: staff sits a real interview, grants consent on the
      candidate's own screen, a second member of staff marks it; flags, dashboard, and a 404 for a
      candidate at every URL. Five screenshots in `apps/web/e2e/.artifacts/`
- [ ] **Nobody has been asked for `transcript_review` in a real deployment**, so a production queue
      is empty and says `no_consent` until they are
- [ ] **The visual capture does not include these screens** (`e2e/visual`), and the header change is
      worth a before/after across the whole set, since it touches every signed-in page
- [ ] **A reviewer cannot see their own agreement.** Admin-only is the conservative reading; showing
      a reviewer aggregates over answers they have _already_ marked would be safe and is probably the
      first thing they ask for

### What the calibration work cost the chrome, and what it is owed

- [x] **Two header regressions at 360px, both found in the screenshots rather than by a test.** A
      third nav link wrapped the wordmark ("Readı" across two lines, fixed with `shrink-0`), and then
      the first fix — letting the nav scroll — put `Admin` outside the viewport with no affordance.
      The header **wraps** now: a nav may not hide a destination. The candidate header carries at most
      one staff link below `sm`, so it never overflows and is unchanged
- [x] **The dashboard was a table** in a horizontal scroller with `Exact` off the right edge, against
      the CMS layout's own note that "nothing here is a table". It is rows now
- [ ] **No test would have caught either**, and that is the honest state: the e2e asserts the links
      are reachable, not that they are on screen. A width assertion or a visual diff is what would

### Phase 7 — measurement, one paid run, the handover

- [ ] **The full before/after visual capture, across every signed-in page** (owner's decision,
      2026-09-28). `E2E_SCREENSHOTS=before pnpm test:e2e visual`, then again after: M4 phase 6 changed
      `AppHeader` so the bar wraps when crowded, and that is shared chrome on every signed-in screen.
      Add the four calibration screens to the capture while doing it — no test would have caught
      either header regression, and both were found by looking

- [ ] **A worker 422 is not a transport failure**: `AiWorkerClient.post` turns every non-2xx into
      `AiWorkerUnavailableError`, so a request the worker will _never_ accept is retried three times
      with backoff and stored as `provider_error`. Found on 2026-09-27, when `EvaluationTurn.text`
      was too short for a real answer: the diagnosis took measuring turn lengths against report gaps
      because the only thing in the log was `attempt failed: AiWorkerUnavailableError`. Two changes,
      both small: **log the status code** (the queue logs `error.name`, not `error.message`, so
      "worker answered HTTP 422" never reaches anyone), and **do not retry a 4xx** — a contract
      violation is a bug to fix, not a condition to wait out. Keep 408, 429 and every 5xx retryable
- [ ] `interviews:pace` — median and p90 answer seconds and words, minutes against `planned_minutes`, how many questions fit 45; sample size on its face
- [ ] **sonnet-5 vs opus-5 agreement, with a recommendation** (owner's decision 7; opus roughly triples session cost)
- [ ] One paid interview → evaluation → report, with costs; a stratified ~60-answer harness run
- [ ] e2e interview → report; the visual capture extended; `measure()` in `slow-network.spec.ts` fixed (the M3 leftover)
- [ ] CLAUDE.md, the spec §4.4/§6.2 amendments, `docs/PROMPTS.md`'s "~20 sample cases", ADRs, handover, lessons
- [ ] `docs/diagrams/figure-10-evaluation-to-readiness.svg` checked against what was built

## M4 phase 5 — the eval harness, the fairness measurement, and the model decision

**Built and proved on the stand-in. Nothing spent yet** — the paid run is waiting on the owner's
go-ahead. Full write-up: `docs/progress/2026-09-28-m4-phase-5.md`.

### 5a — prompt caching at the LLM seam (a prerequisite, not a detour)

- [x] `LLMClient.parse` gains `cache_system`; the Anthropic client sends the system prompt as one block
      with an **explicit** breakpoint on it (top-level automatic caching would place it after the
      per-call tail and write an entry nothing could read); `LLMResult` carries the two counts
- [x] `pricing.py` prices them at 1.25x (write) and 0.1x (read) of the input rate, so
      `cost_micro_usd` is still the sum of its own row's units at three rates
- [x] `AiCallRecord.cache_write_units` / `cache_read_units`, the two `ai_call_log` columns, and the
      migration read by hand — Prisma proposed `DROP INDEX questions_embedding_hnsw` for the
      **eleventh** time in a migration that adds two integers to `ai_call_log`; deleted, applied with
      `migrate deploy`
- [x] **The fan-out lost its first place.** Four parallel calls on a cold prefix each pay the 1.25x
      write and read nothing — `4 x 1.25` against `4 x 1.00` uncached — so caching plus the old
      fan-out was a net loss at MVP volume, where cold is the normal case. The first answer is scored
      alone and the rest fan out behind it: ≈15 s of the 60 s budget, for ≈9% of the bill cold and more
      under traffic (the entry is **global** — one system prompt for every answer of every session)
- [x] **Pre-warming is not available to us**, whatever phase 4.6 preferred: `max_tokens: 0` is an
      `invalid_request_error` together with `output_config.format`, which every evaluator call uses.
      Recorded in `evaluation/calls.py`
- [x] `evaluation.processor.spec.ts` — the head, **watched failing** with `concurrently(all)` put back,
      and the tail proved genuinely concurrent so the test cannot pass on a sequential loop
- [ ] **Caching has not been observed working against the real API.** `cache_read_input_tokens > 0` is
      the only ground truth and needs a paid call. The report says so loudly if caching was asked for
      and nothing was read back, naming the three causes — so the first paid run verifies this too

### 5b — the harness

- [x] `readi_worker/evals/`: `dataset.py`, `requests.py`, `metrics.py` (pure), `results.py`,
      `report.py`, `run.py`. Reads `content/seed` and `evals/datasets`; no database, no Redis, no
      service token — which is what makes it runnable in CI and from a dispatch job
- [x] Every call goes through the real `EvaluationService` over the real contract, so the three gates,
      the retry loop and the evidence verifier that run in production are what is measured
- [x] Fairness **per criterion with the dimension named** (an average hides the one descriptor that
      cost three rungs), one-sided; the two separations on `check-stress.mjs`'s own 0.8 margin;
      agreement as five figures, because each hides what the others show
- [x] **`test_the_written_scores_pass_their_own_checks`** — the corpus's own expected scores through the
      Python harness must reach `check-stress.mjs`'s verdict on the same numbers: 102 rubrics, no
      problems. Two implementations of one rule in two languages, agreeing on the real corpus
- [x] `--dry-run` prints the sample and each model's cost, with the input tokens **counted** when a key
      is present (`count_input_tokens`, free, tested against a mock transport) rather than estimated
- [x] `--compare` reads two result files: free, repeatable, and the reason the run file holds every
      per-criterion score and every call's usage rather than a summary
- [x] Sequential by default; `--concurrency` exists to be left alone
- [x] `evals/thresholds.yaml` (agreement only — the separation margin and fairness band stay in
      `metrics.py` beside the code that applies them, because three copies of 0.8 is how three drift),
      `evals/datasets/gold/` with its format and a skipped `*.template.yaml`, `evals/README.md`,
      `evals/results/README.md`
- [x] `--smoke` inside `pnpm test`: it asserts the machinery and **refuses** to assert the fairness band
      or the separations, because the stand-in scores on the word "because". The §6.2 evidence check was
      watched failing
- [x] `.github/workflows/evals.yml`, `workflow_dispatch` only, path filter written and commented with
      the reason
- [x] Lint, typecheck green. `pnpm test`: 599 API, 396 worker, 176 web, 119 shared-types, 56 ui, 3
      api-client

### Waiting on the owner

- [x] **The paid run — done, 2026-09-28**, and the results are the next three sections. What it was
      approved on: **$3.23 for both models**. What it cost: **$5.93**, over four runs. Where the
      difference went, because an estimate that is beaten teaches something — counted input was 19%
      above the 3.7-chars/token estimate (207,887 tokens against 174,157, the prefix 2,055 rather
      than 1,698), opus's rejected-reading rate was 33% rather than the 20% allowed for, its output
      ran 1,194 tokens a call against 1,000, the account ran out of credit mid-run so ten answers
      needed a second paid pass, and **two opus runs overlapped** — only one of them launched from
      the Claude session, and the other has no log on this machine, no crontab and no timer behind it
- [x] **The recommendation** decision 7 asks for: it is the last of the three sections below, and it
      is to stay on opus for now

### The paid runs, 2026-09-28 — both models measured, and the model decision

**$5.93 spent in total** over four runs: two overlapping opus runs ($2.46 + $2.16), sonnet ($0.75) and
the opus retry ($0.56). Four result files in `evals/results/`, **none committed** — the owner's call.

- [x] **The fairness band held on both models, and the sonnet sample is the complete one.** Per
      criterion with the dimension named: **opus 0 of 36 outside the band** (mean drift −0.06 rungs,
      worst +1, two criteria at +1), **sonnet 0 of 36** (mean drift +0.00, worst +1, three at +1 and
      three at −1). Quote it as "fair to model-written Nigerian English", never as "fair": 12 idiom
      answers per model, AI-written, scored by the same family of model
- [x] **Both separations, both models, on every rubric**: opus 12 of 12 and 12 of 12, sonnet the same.
      Smallest fluency gap +1.25 (opus, `incident-ownership`) against the 0.8 margin
- [x] **Caching is observed working against the real API** — the open item from 5a. One write of 2,966
      tokens and a read on every billed call after it; 66% (opus) and 67% (sonnet) of prompt tokens
      served from cache. The real cached prefix is **2,966 tokens, not the 2,055 `count_tokens`
      reports**: `count_tokens` takes no `output_config`, so the schema's tokens are inside the cached
      block and outside the count, exactly as `count_input_tokens`'s docstring warns
- [x] **opus scores are stable between runs.** The two accidental runs and the merged one agree at
      **89–90% exact, 100% within one rung, MAE 0.10–0.11, bias +0.01** per criterion over 47–50
      answers. CLAUDE.md said whether the constrained schema and `effort: low` are enough was "a
      measurement the `/evals` harness makes, not an assumption" — this is that measurement
- [ ] **sonnet stability is not measured**, and needs a second sonnet run (~75¢). Not run because the
      authorised runs were sonnet once and opus's ten missing answers

### What the rejection causes turned out to be (the reason to record them)

- [x] **`ai_calls` error codes are now in the run file** (`CaseResult.call_errors`), and the report has
      a `## Why calls bought nothing` section: per cause, with its share of calls and what the gate is
- [x] **One cause, and it is opus's alone: `rejected_criteria`** — a reading that left a criterion out
      or invented one the rubric does not have. **7 of the opus retry's 17 calls; 0 of sonnet's 60.**
      Sonnet threw away **nothing** across 60 answers, where opus discarded 32 readings over its 110
      calls. The 33% was never the model being careful; it is this one gate, on this one model
- [x] **`invalid_output` as a case-level error was hiding it.** `service.py` sets
      `failure = "invalid_output"` when a gate rejects, so an answer rejected three times reads as
      schema-invalid output in the run report. The four opus answers that failed that way in the first
      run all scored on retry — they were `rejected_criteria` all along, and the per-call codes are
      what say so
- [ ] **Worth trying before phase 7 quotes a cost**: the opening of `evaluate_answer.v2.md` asking for
      exactly one entry per listed criterion, or the retry correction naming the positions it wants
      back. A third of opus's bill is one fixable gate, which is a bigger lever than the model choice —
      and it is a **v3**, because v2 is released and named in these runs' `prompt_versions`
- [ ] **25 of opus's 32 rejections have no recorded cause** and never will: they are from the run
      written before the codes existed. The merged report says so where the table is rather than
      presenting the attributed 7 as the total

### Two counting flaws fixed, both of which flattered

- [x] **An unmeasurable pair is no longer a pass** (`report.py`, `Separation.fairness_measured`). The
      denominators are the rubrics where the comparison could be made, and the rest are **named**: the
      first opus run printed "fluency: 11 of 11" on 9 measured rubrics and "0 of 12" on 9 comparable
      ones. `tests/test_evals_report.py`, **watched failing** against the old formula. `--smoke` can
      never catch this, because the stand-in scores every answer it is given
- [x] **A merge may not add up `failed`.** It is one per answer, not one per attempt, so the first
      merged file reported 10 unscoreable answers in a run where all 60 had scores. The failed
      attempt's tokens and money stay additive; what went wrong with it stays in `call_errors`
- [ ] **`Usage.failed` is derivable from `CaseResult.error`** and is stored anyway, which is why it
      could disagree with it at all. Making it a property would remove the possibility rather than fix
      the instance
- [ ] **There is no way to re-render a stored run**, though "every figure is recomputed from the file"
      is the whole design. Re-reporting the merged run took a scratchpad script; a `--render RESULT`
      flag is a few lines and would make the promise real

### `--retry-unscored`, and why it is in the harness rather than in a shell

- [x] **`--retry-unscored <result.json>`** re-scores only the answers a run has no score for and writes
      the two **merged as one whole run**, so the file stays comparable with another model's. It
      refuses a different model or dataset **before** it spends anything — a file holding one model's
      readings of some answers and another's of the rest would be a lie nothing downstream could
      detect. A retried answer carries both attempts' cost, because the first attempt was paid for
      (ADR-0007). Verified free with `--dry-run` before the paid run
- [x] `evals/README.md` and CLAUDE.md §4 document it; 417 worker tests, ruff and mypy green. Nothing
      outside `apps/ai-worker` changed, so no contract regeneration and no API or web work

### `evaluate_answer.v3` — the fix for `rejected_criteria` (2026-09-28, waiting on a paid check)

**Nothing paid has been spent on this.** Proved on the stand-in; only a paid run can show the rate
falls, and the sizing for it is at the end of this section.

- [x] **What the gate actually refuses, and what could not be recovered.** `rejected_criteria` fires
      when the returned set of `criterion` numbers is not the rubric's — one left out, or one invented.
      The runs recorded the **code and not the detail**, so which of the two it was is a guess: the
      shape of the mistake was thrown away with the reading. Fixed for next time — `_Checked.detail`
      carries `expected 0, 1, 2; got 1, 2, 3` into the log line, integers only, so it names no
      candidate words and no rubric prose
- [x] **The root cause both mechanisms share is in the rendering.** `criteria_block` numbers criteria
      from **0** and prints each criterion's five rungs, also labelled 0 to 4, directly underneath. The
      criterion number and the score are the same kind of token in the same block, and neither prompt
      said which was which or what the expected set was — v2's instruction was "use the number it is
      given here", which is only unambiguous if you already know where to look
- [x] **`evaluate_answer.v3.md`** states it as a rule and early: one entry per listed criterion and no
      others; the numbers start at 0 and are **not** scores (`criterion` is the number before the
      dimension, `score` is the rung under it); an answer that reaches a criterion not at all is a 0
      with empty evidence, **never a missing entry** — which is the failure the rule would otherwise
      invite. And what it costs, because that is the part a model cannot know: the whole reading is
      discarded, so every criterion loses its mark, including the ones it read well
- [x] **`evaluate_answer_input.v2.md`** prints the expected numbers instead of leaving them to be
      inferred (`exactly these numbers, one entry each: 0, 1, 2`), from the same list `_check` builds,
      so the instruction and the gate cannot disagree about what was asked for
- [x] **The retry correction names the whole expected set**, not only what the last attempt got wrong.
      A reading numbered 1,2,3 against a rubric numbered 0,1,2 is _both_ a missing criterion and an
      invented one, and being told each separately leaves the off-by-one that caused both to be
      inferred
- [x] **Proved on fake, and the limit of that is the point.** A scripted reading numbered from 1 is
      rejected, retried with a correction naming `0, 1`, and scored — so the retry carries the
      information; the rendered prompts are asserted to carry the rule and the set; `--smoke` is green
      with `prompt_versions` reading `evaluate_answer 3, evaluate_answer_input 2`. None of that is
      evidence the **rate** falls, which needs a real model
- [x] 421 worker tests, ruff, mypy green. `apps/api`'s fake worker still reports
      `evaluate_answer: 2` in its fixtures — deliberately untouched, because those tests assert the
      API stores what a worker told it, not what the real worker sends
- [x] **The paid check ran and v3 did not fix it (2026-09-28).** Approved at $1.60, **stopped at $1.23**
      with 22 of 30 answers when the projection crossed the cap — the standing rule's first test, and it
      applied to me. **17 rejected readings over 39 calls (44%)** against a matched v2 baseline of
      **42 over 112 (38%)** on the same five rubrics with credit-failure calls excluded; answers needing
      a retry **50% (11/22) against 29% (20/70)**. Both differences are inside the noise, and neither is
      a fall. **Clearer instructions are not the fix.** The lead v3 never touched: the rejections
      concentrate in `weak`, `fluent-but-wrong` and `correct-poorly-explained`, where a rubric's lower
      descriptors do the work — 11 of the 11 retried answers were those three kinds
- [x] **v3 is written, tested and not in use** (owner's decision, 2026-09-28). `PROMPT_VERSIONS` names
      `evaluate_answer` v2 and `evaluate_answer_input` v1, because every figure M4 rests on was
      measured on those; the v3 files stay and stay under test, because an untested prompt file rots
      and the structural attempt builds on them. **One piece is code, not a prompt, and is still
      live**: the retry correction names the whole expected set of criterion numbers. Not reverted —
      the decision named `PROMPT_VERSIONS` — and it is one line if it should go too
- [x] **The lead: it is not a counting failure.** Every one of the eleven retried answers was a
      `weak`, a `fluent-but-wrong` or a `correct-poorly-explained` — the three kinds where a rubric's
      _lower_ descriptors do the work, and never a `strong` or a `nigerian-english`. That is a model
      **leaving out the criteria an answer did not reach** rather than scoring them 0 with no
      evidence (spec §6.2), which is a thing wording has now failed to prevent twice
- [x] **The structural fix is built and off**: `evaluation/strict_schema.py` builds the reading model
      per request from that rubric's positions — `criteria` an object keyed by position, every key
      `required`, `additionalProperties: false`. Omission and invention are invalid output rather
      than a gate rejection after the fact. Proved on the stand-in end to end
      (`--smoke --strict-criteria`); **never sent to a real provider**
- [x] **`prefixItems` would have arrived as prose.** The natural shape — a fixed-length tuple with a
      `const` per entry — is folded by `anthropic.transform_schema` into the schema's _description_,
      so the provider would have received an unconstrained array and a sentence about tuples. A
      guarantee that looked real and enforced nothing. `required` and `additionalProperties` survive,
      which is why the shape is an object; both halves are pinned in
      `test_evaluation_strict_schema.py` so nobody improves it back
- [ ] **Phase 7 owes it a measured run**, and the first thing that run must check is that the provider
      **accepts** the schema at all — a 400 on the first call answers it for a fraction of a cent.
      Only then is it worth measuring the rejection rate against the 38% v2 baseline
- [x] **A run now records which evaluator shape it asked for** (2026-09-28). `RunResult.strict_criteria`
      is on the file, on the report header of **every** run and not only a strict one, and named in a
      `--compare` when the two sides differ — two runs of one model otherwise read as "opus against
      opus". And `--retry-unscored` refuses a mismatch, as it already did for the model: `merge_retry`
      carries the **retry's** flag, so a strict retry of a plain run would write `strict_criteria: true`
      over a file most of whose answers were scored without it, and the rejection rate is the one
      figure that flag exists to be read against. This is the 2026-09-28 lesson in its second form —
      the v3 check's rate had to be reconstructed from cache-read counts because the run recorded too
      little of itself
- [x] **Re-proved on the stand-in, 2026-09-28.** `--smoke --strict-criteria`: 10 answers, 10 calls, 3
      scores on every one, nothing rejected, nothing unscoreable, the evidence rule clean, and the file
      reads `strict_criteria: true`. `anthropic.transform_schema` hands the provider
      `required: ["0","1","2"]` and `additionalProperties: false` on `StrictCriteria`. 437 worker tests,
      ruff and mypy green
- [x] **`--max-cost` (2026-09-28), because a cap nobody is watching is not a cap.** The standing rule
      was enforced by a person reading the cost column — the v3 check was approved at $1.60 and
      stopped by hand at $1.23. Now the run stops itself, writes its file and exits 1, and the reason
      is on the file (`RunResult.stopped`) as well as on stderr: a partial run read back next week has
      to say whether the money ran out or the provider did. Two deliberate choices that would
      otherwise read as bugs, both written down in `evals/README.md`: it stops **between answers**,
      because an answer is up to `MAX_ATTEMPTS` calls whose cost is assembled once at the end and
      aborting inside one would lose the record of calls already paid for (ADR-0007); and it stops
      **with money left over**, because the bound on the next answer is `MAX_ATTEMPTS` times the
      dearest call seen, which no answer already scored can beat. A cap plus `--concurrency` above 1
      is refused outright — the calls that would cross it are in flight before the answer ahead of
      them is recorded
- [x] **The paid check ran and the schema works (2026-09-28).** Handover:
      `docs/progress/2026-09-28-strict-criteria-run.md`; run file
      `evals/results/20260928T195502Z-claude-opus-5.json`. Approved at $1.60, spent **99.86¢**.
      **0 rejected readings over 30 calls** against a matched v2 baseline of **44 over 179 (25%)** on
      the same six rubrics, and **0 of 30 answers needed a retry** against 41 of 90. One call per
      answer, thirty times; under the baseline rate the chance of that is about 0.02%. The provider
      accepted the schema on the first call, which was the question the run had to settle first
- [x] **And it did not move the scores**, which is the regression half of the claim. On the 21 answers
      it and `013035Z` both scored the two readings agree **89% exact, MAE 0.11, r 0.97, bias +0.02**,
      and against the written expectations **76% exact / MAE 0.24 against v2's 75% / 0.25** — not a
      drop. Fairness **0 of 18 criteria outside the band**, both separations **6 of 6**, 0 evidence-rule
      violations over 183 quotes, 0 unscoreable. The perfect fairness figure is not new: the v2 runs
      were already clean on these rubrics (worst +0)
- [x] **3.33¢ an answer against 5.03¢ — a 34% fall**, almost exactly the third the model-choice decision
      predicted from fixing `rejected_criteria`. A 30-minute session drops from 40.3¢ to **26.6¢**, and
      the gap to sonnet narrows from 4.0x to 2.6x. That does not overturn opus, which was chosen on
      agreement rather than price, but it is the first of the two things that decision named as able to
- [x] **`--rubric SLUG` (repeatable), because the complement of a sample is not a sample.** The strict
      check scored the six rubrics of `--sample 6 --seed 7`; extending it to the same twelve the earlier
      non-strict runs used means scoring the other six **without paying again for the first six**, and
      no combination of `--sample`/`--seed` expresses that. A test pins the premise it rests on — that
      `--sample 6` is a strict subset of `--sample 12` at seed 7 — because if the round-robin sampler's
      prefix ever stopped being stable, two runs that looked like one measurement of twelve would
      silently overlap or leave a gap
- [x] **Done, and the schema is the default (2026-09-28).** The second strict run scored the six
      `frontend`/`qa` rubrics — $1.04 of a $1.20 cap, **0 rejected over 30 calls** again, 0 unscoreable,
      separations 6 of 6, fairness 0 of 18 outside the band. Over both runs and all twelve rubrics:
      **0 rejected over 60 calls** against the v2 baseline's 74 over 297 (25%), which under that rate
      has a probability of 3e-8. `EVALUATOR_STRICT_CRITERIA_SCHEMA` now defaults **true**, `.env.example`
      and CLAUDE.md say so, and `--strict-criteria` in the harness is `BooleanOptionalAction` defaulting
      on — with a test asserting the harness default and the setting are the same value, because a
      harness defaulting to the _other_ evaluator would measure a shape no candidate is scored with
- [x] **Cost per session: 13.6¢ / 27.2¢**, from 3.40¢ an answer over all 60. The first run alone read
      13.3¢ / 26.6¢ and the second is slightly dearer; the combined figure is the one to quote. A
      30-minute session is two thirds of the 40.3¢ the model decision was taken on, and the gap to
      sonnet narrows from 4.0x to 2.7x
- [x] **The `Evaluator` constructor's own default stays off, deliberately.** `main.py` passes the
      setting, so production is strict either way; flipping the constructor broke 60 `service.py` tests
      because their stubs answer in the list shape. Those tests exercise the three gates — including the
      `rejected_criteria` check the schema is meant to make unreachable, which is still live code and
      still the last line if a provider ignores the schema, so it needs a shape it can fire on
- [x] **Settled 2026-09-28: it was run-to-run noise, and strict stays the default.** The repeat run on
      the frontend/qa six (`20260928T205141Z`, $1.02 of a $1.20 cap) killed the finding three ways.
      **The strict noise floor is 84%/0.16** on these rubrics, and "strict vs v2" **straddles** it
      rather than sitting below: run 1 was 80%/0.20, run 2 is **89%/0.11** — better agreement with v2
      than either configuration manages with itself, and a difference that reverses on a re-run is not
      one. Against the expectations the distributions **overlap**: v2's three runs are 85/91/89 and
      strict's two are 80/87, with v2's own runs 6 points apart — the same order as the 9-point gap that
      raised the flag. And **the fairness drift reverted exactly**: +0.17 with 3 criteria a rung below
      `strong` became **-0.06 with none**, which is v2's figure to the decimal. Every run of both
      configurations stayed inside the band
- [x] **Three strict runs: 90 answers, 90 calls, 0 rejected, 0 unscored, 3.40¢ an answer** — the same
      figure to the penny all three times. P(90 clean calls at the 25% baseline rate) is 6e-12.
      Sessions stand at **13.6¢ / 27.2¢**. What no run can settle is that all of it is agreement with
      **model-written** expectations; only `evals/datasets/gold` can say whether a score is right, and
      it is empty
- [ ] **Superseded — not clean, and worth one more run (~$1.04): strict reads the frontend/qa six differently.**
      Two v2 runs on one sample give the evaluator's noise floor, so this is measurable rather than
      arguable. On the backend six strict is a repeat run (92%/0.08 against a 93%/0.07 floor, and 81%
      vs 80% against the expectations). On the frontend/qa six it is not: **80%/0.20 against an
      88%/0.12 floor**, and **80% against v2's 89%** on the same answers. Spread across all five kinds
      (`weak` -17, `correct-poorly-explained` -11), **every disagreement within one rung**, mean
      criterion -0.02. Fairness moved the same way and stayed in the band: drift +0.17 against v2's
      -0.06 to -0.13, 3 of 18 criteria one rung below `strong`. The expectations are **model-written**,
      so nothing here says strict is worse — CLAUDE.md's rule is about human scores and there are none.
      **A second strict run on the same six gives the strict noise floor**, which is the only thing
      that separates "the schema reads these differently" from "this run did". Reverting is one line
- [ ] **Nobody records which schema scored a stored evaluation.** `answer_evaluations` keeps provider,
      model, `prompt_versions` and `SCORING_VERSION`; the schema shape is none of them. It changes what
      can be rejected and what a call costs, not the score's meaning, so the deployment's config plus
      the date answers it and a column would be an operational detail. Revisit **if the flag is ever
      toggled in production**, because the date stops answering it then
- [ ] **Superseded — owner's decision, 2026-09-28: complete the evidence, then switch.** The other six of
      `--sample 12 --seed 7` are `async-ordering-understanding`, `async-unblocking`,
      `client-boundary-reasoning`, `help-seeking-judgement` (frontend) and `raising-a-quality-concern`,
      `test-data-judgement` (qa) — so this closes the **role** gap, the only one of the three limits a
      bigger sample can close. **≈$1.00** (30 answers at the measured 3.33¢), cap **$1.20**: the
      estimator can be trusted now that rejections are gone — it said $0.97 for the first strict run and
      the bill was 99.86¢. If it comes back clean, make the schema the default and update the handover
      with 13.3¢ / 26.6¢ per session
- [x] **Corrected: the "five-criterion rubric" limit does not exist.** The first write-up of this run
      said a wider rubric had never been sent to a real provider and that the 12-rubric run was where it
      would be seen. Counting says otherwise: **all 102** rubrics in `evals/datasets/synthetic` and
      **all 102** in `content/seed` (29 backend, 30 frontend, 33 qa, 10 shared) have exactly three
      criteria. `check-bank.mjs` permits 3–5, but nobody has written one, so no run over this corpus can
      exercise it and no candidate can meet it. The schema is measured at exactly the width the product
      uses; the thing to measure is the **first** 4- or 5-criterion rubric, not a bigger sample For: the rejection
      rate gone, the scores unmoved, fairness and both separations unchanged, a third off the bill.
      Against: **all six rubrics are `backend` and all have exactly three criteria**, so a five-criterion
      rubric has still never been sent to a real provider under this schema. The keys are the rubric's
      own positions so the mechanism does not obviously depend on the count, but it is untested
- [ ] **Superseded — the paid check, priced and awaiting the owner (2026-09-28).** `--sample 6 --seed 7
--strict-criteria` = **30 answers over 6 rubrics**, the **same sample the v3 check used**, which is
      what makes it comparable with that run's 17-over-39 and its matched v2 baseline of 42 over 112.
      **$1.05 if the rejections go, $1.51 if nothing changes**, from the measured 3.5¢ and 5.03¢ per
      answer rather than the estimator (which quotes $0.97/$1.16 and undercounts input by 19%).
      Proposed cap **$1.60**. Acceptance costs nothing to find out: a 400 on call 1 is unbilled, the
      file is written after every answer, and the run would be stopped there. The cheaper alternatives
      are `--sample 2 --seed 7` (10 answers, 35¢–50¢, `incident-ownership` +
      `unfamiliar-code-approach`) and `--sample 1 --seed 7` (5 answers, 18¢–25¢), both of which answer
      acceptance and neither of which can be read against a baseline. **Approved at $1.60 by the
      owner, 2026-09-28**, and the run now carries that figure as `--max-cost 1.60`
- [ ] **Superseded — what to do with v3 while it was in use.** `PROMPT_VERSIONS` says `evaluate_answer: 3`,
      so the worker renders it now, for no measured gain and a slightly worse price (the prefix grew from
      2,966 to 3,291 tokens, read at 0.1x on every call). It is better written than v2 and states a true
      rule; it simply does not do what it was written for. Either revert the two entries to v2 and keep
      the files for a further iteration, or keep v3 and stop claiming it as the fix
- [x] **A killed run no longer loses everything.** The file is written **after every answer**, and the
      run records what it `planned` to score — so `--retry-unscored` finishes a stopped run rather
      than merely re-running its failures. `merge_retry` needed the same lesson: walking only the
      previous run's `cases` silently dropped every answer the stop never reached, which a test caught
- [x] **The rejection detail prints now.** The harness lets `readi_worker`'s own INFO through for the
      length of a run, so `expected 0, 1, 2; got 1, 2, 3` reaches the log it was written for. That is
      why the causes of those 17 rejections are unknown and the next run's will not be
- [ ] **Superseded — what the check run was sized as.** `--sample 6 --seed 7` = **30 answers over
      6 rubrics**, and the sample matters: it holds `transaction-boundary-reasoning` (14 rejections
      over 41 calls, the worst in the corpus), `scaling-out-reasoning` (10/24), `incident-ownership`
      (9/23), `stale-write-diagnosis` (6/21) and `unfamiliar-code-approach`, whose five answers failed
      outright in the first run. **$1.05 if the rejections go, $1.51 at the old rate** — quoted from
      the measured 5.03¢ and 3.5¢ per answer rather than the estimator, which undercounts input by 19%
      and allows for 20% rejections where the truth is 25–33%. The cheaper option is `--sample 4`
      (20 answers, 70¢–$1.01), which leaves out the worst offender
- [ ] **The baseline to beat, over three opus runs and 180 answers**: **74 rejections over 297 calls
      (25%)**, and **39 of 180 answers (22%)** had at least one. So if v3 works, 30 answers should show
      close to none: at the old rate the chance of seeing zero is about 0.1%, which is what makes a
      run this small decisive in the direction that matters
- [ ] **What it cannot settle.** A halving would not be distinguishable from noise at n=30 — only
      "near zero, like sonnet" or "unchanged" would be. If it comes back ambiguous the next step is
      the full 60, not a bigger guess

### Phase 7 — measurement, the visual review, the handover · **done 2026-09-28**

Handover: `docs/progress/2026-09-28-m4-phase-7.md`.

- [x] **`pnpm --filter @readi/api interviews:pace`** — pure module + thin CLI, the sample size on its
      face. On the dev data: 4 real sessions, 20 answers, opening answers median 74 s / p90 198 s,
      follow-up answers median 61 s / p90 224 s. **`SECONDS_FOR_A_FOLLOW_UP` is 45 s and 5 of 8
      follow-up answers ran past it** — the reserve that decides whether to _ask_ a probe, so the
      engine starts probes the clock cannot finish. Median pace gives 4 questions per 15 minutes,
      exactly `INTERVIEW_PLANS`
- [x] **Acted on 2026-09-29: `SECONDS_FOR_A_FOLLOW_UP` 45 -> 75** (owner's decision), taking
      `SECONDS_TO_OPEN_A_QUESTION` to 195 and the report's count from 5 of 8 past the reserve to 3 of 8. **Provisional on n=8** and written down as such in `budgets.py`, with the way to revisit it:
      "follow-up answers that ran past it" on `interviews:pace`, which refuses to read as a constant
      under 40 answers. Over-reserving is the safe direction — an unasked criterion is not assessed
      and leaves the denominator, so the cost is a shorter interview and never a lower score. The TS
      mirror in `pace-reserves.ts` moved with it and the drift test was **watched failing**
- [x] **Running it found three defects in it**, one of them impossible-on-its-face (6 questions
      answered against a budget of 4, because the candidate's own questions were counted as answers).
      Also: stand-in-driven sessions were being averaged into a human-pace figure, and a session with
      no answers made a pace out of latency alone. All three have tests
- [x] **The e2e interview → report chain** already existed from phase 4 and is green: setup, answers,
      the follow-up cap, the read-ahead leak, resume, Redis loss, ending early, the scoring poll, and
      the report with its answer-key boundary asserted on the rendered page
- [x] **The visual review as a real before/after**: 156 shared screens at `95c8386` and at the tip.
      **Nothing moved** — every full-page height identical except the three interview screens, whose
      content is their own transcript. `/admin` and the CMS at 360px changed as intended (the header
      wraps to a second row, every destination visible); candidate pages under 0.5%
- [x] **The four calibration screens joined the capture** (43 screens, 172 shots), needing a
      `reviewer` state and a sixth account that is never photographed — the answer's author, who must
      be somebody else and must be staff that granted transcript review
- [x] **`measure()` fixed** (the M3 leftover): it timed our own `page.goto` call rather than the page
      load, and on a prefetched route timed the swap. Now cold, cache dropped, and read from
      `PerformanceNavigationTiming` after the load event; a cached navigation fails instead of passing
- [x] **A latent flake in `interview.spec.ts`**: `getByText` matches substrings and every probe
      contains its question's identifying fragment
- [x] Spec §4.4 and §6.2 amended in place; `figure-10` corrected (it called M4 "not yet written" and
      the evaluator "low temperature", which current Claude models reject); CLAUDE.md §4 and §5
- [ ] **Not fixed, deliberately: the before/after workflow trips over `apps/web/.next/types`.**
      `tsconfig.json` includes the **dev** build's generated route validator, so the e2e build
      type-checks against it and a capture on another commit fails naming routes that do not exist
      there. `rm -rf apps/web/.next/types apps/web/.next/dev/types` unblocks it and the directory is a
      cache. Every fix creates the same failure in the other direction or is a bigger change than the
      trap deserves; it is written down in the visual README instead

### The recommendation decision 7 asked for (2026-09-28)

- [x] **Agreed by the owner, 2026-09-28: `claude-opus-5` for the MVP and the pilot, decided again on
      the gold set.** The reasoning it was agreed on:
- [ ] **Keep `LLM_MODEL_EVALUATOR=claude-opus-5` for the MVP, and revisit on the gold set.** Both
      models are fair on this sample and separate every rubric, so the tie is broken lower down:
      opus agrees with the written expectations at 84% exact / MAE 0.16 against sonnet's 73% / 0.28,
      and sonnet is harshest exactly where a candidate would notice — `weak` at 58% exact, MAE 0.42.
      Those expectations are model-written, so this is a **regression baseline and not proof of
      quality**; it is the only evidence there is, and product principle 1 puts the feedback above
      what it costs. **The cost is real**: 40.3¢ against 10.1¢ per 30-minute session, four times.
      The two things that would change the answer: sonnet's 0-in-60 rejection rate against opus's 32
      (fix `rejected_criteria` and opus's bill drops by about a third), and a **gold set**, where
      "agrees with a model" stops being the tie-breaker. Neither is a reason to switch today

### The fairness result is not proof until real candidates have been scored (2026-09-28)

- [ ] **Validate the fairness band against real Nigerian-English answers from pilot candidates, with
      consent, before treating the evaluator as proven.** The `nigerian-english` answers in
      `evals/datasets/synthetic` are **AI-written** — a model's idea of the idiom, written by the same
      family of model that then scores them. A passing band therefore shows the evaluator is fair to
      _that_, and it is the strongest thing measurable today, but it is **not** the claim the product
      makes (CLAUDE.md product principle 3). The two ways it could pass and still be wrong: - the drafter wrote an idiom milder or more literary than the one candidates actually use, so the
      answers never test the descriptors that would punish real speech; - the same model reads its own register more charitably than a human's, which no amount of
      sampling from the synthetic set can detect.
- [ ] **What it needs, and what it is behind.** Real answers mean `transcript_review` consent
      (ADR-0017), a signed `reviewer-agreement.md`, and a route into `evals/datasets/gold/` — so this
      sits behind **phase 6 and the pilot**, not behind phase 5. The format and loader are already
      there (`evals/datasets/gold/README.md`, `*.template.yaml` skipped), and the harness runs against
      `--dataset gold` unchanged: it is the answers that are missing, not the machinery
- [ ] **Until then, say so where the number is quoted.** `evals/README.md` and the phase 5 handover both
      carry the caveat; anything that repeats the fairness figure to anyone — a handover, a pitch, an
      investor page — repeats it as "fair to model-written Nigerian English", never as "fair"

### Carried into phase 7 from here

- [x] **The intermittent API failure is caught and named** (`docs/progress/2026-09-28-flaky-test-hunt.md`,
      appended). It is `test/content-no-answer-key.int.spec.ts`, and it is a **Postgres connection
      timeout in `beforeAll`** — a Failed Suite, not a failed test, which is why the counts read
      `568 passed | 31 skipped`. Saving the whole log instead of tailing it is what found it
- [x] **The second error was ours and hid the first.** That spec's `afterAll` ran
      `deleteMany({ userId: { in: [undefined, undefined, undefined] } })` — a `beforeAll` that dies
      before the three `giveProfile` calls leaves every id unset — so a `PrismaClientValidationError`
      is what the log showed. The hook now filters the ids it has, skips content it never created and
      closes an app that may not exist
- [ ] **The contention itself is not fixed, on purpose.** A pool timeout under six parallel package
      suites on six cores and 7 GB is the machine; the remedies (bigger pool, fewer turbo lanes,
      `--maxWorkers`) each trade something real against a failure seen about once in twenty local runs
      and never in CI. What changed is that it names itself on the first occurrence now
- [ ] **The interview's own caching is the larger prize and is untouched.** Fourteen calls a session
      against the same system prompt _and_ the same session bundle — a per-session prefix worth far
      more than a per-call one — and the interview is sequential by construction, so it needs no
      reshaping. Only 4.79¢ to save 12-16% of, so not urgent; the seam is now in place

## The pilot is postponed — what stays unvalidated (owner's decision, 2026-09-29)

The plan is saved at `docs/plans/p0-pilot.md` and is **not** being built. It is P0 rather than a
milestone because what it needs is real candidates consenting, not code: the calibration tool, the
gold-set loader, `interviews:pace` and `--dataset gold` all exist already.

Five things therefore stay unproven while M5 and everything after it is built. **Each of them is a
figure that must keep its caveat every time it is quoted** — in a handover, a pitch or an investor
page — because each is currently measured against a model rather than against a person.

- [ ] **Fairness on real Nigerian English.** "0 of 36 criteria outside the one-rung band" is fairness
      to `nigerian-english` answers **written by the same family of model that scored them**. It is
      the strongest thing measurable today and it is not the claim the product makes (product
      principle 3). Quote it as "fair to model-written Nigerian English", never as "fair"
- [ ] **The gold set is empty.** Every agreement figure (80–87% exact) is against model-written
      expectations: a regression baseline, evidence about drift and not about quality.
      `thresholds.yaml` is enforced `on_provenance: human` so it cannot quietly start passing.
      Blocked on a signed `reviewer-agreement.md` (ADR-0017 decision 6), which does not exist, and on
      candidates granting `transcript_review`
- [ ] **Answer pace, and `SECONDS_FOR_A_FOLLOW_UP = 75`.** Provisional on **eight** follow-up answers
      from four real sessions. The figure to re-read is "follow-up answers that ran past it" on
      `pnpm --filter @readi/api interviews:pace`, which refuses to read as a constant under 40
      answers — roughly ten sessions. Over-reserving is the safe direction, so the cost of being
      wrong here is a shorter interview and never a lower score
- [ ] **The evaluator model choice.** `claude-opus-5` was agreed for the MVP on a tie-breaker of
      "agrees with the written expectations at 84% against sonnet's 73%" — and those expectations are
      model-written. At four times the price (40.3¢ against 10.1¢ per 30-minute session) the answer
      may well change on a gold set, so the decision is explicitly open
- [ ] **Report usefulness.** No real candidate has read a report. This is the one with no metric and
      the one product principle 1 puts first; it is settled by candidates' own words, not by a
      threshold
- [ ] **Also blocked behind the same agreement:** `CALIBRATION_ALLOW_CANDIDATE_TRANSCRIPTS` stays
      false, so calibration runs against staff answers only. The tool is built and demonstrated end
      to end; what is missing is the signature

## M5 — voice mode (branch `feat/m5-voice`, from `main` at `9afb977`)

Plan: `docs/plans/m5-voice.md`, with the owner's ten decisions taken 2026-09-29 before any code was
written. ADRs: **0019** (transport, who drives, the latency ladder) and **0020** (the benchmark's
method). Phases 0–5 need nothing from the owner but the provider accounts at phase 2.

**Two of the ten decisions were the owner's amendments to what was proposed, and both are sharper
than the proposal:**

- **The acknowledgement is a rotated set, not one line, and never evaluative.** One fixed line sounds
  like a machine by the third question. And nothing in the set may sound like approval: a candidate
  who has just answered badly must not hear praise that their report then contradicts — praise is the
  evaluator's to give, from a rubric. A test asserts the set holds no evaluative word
- **A person listens to every benchmark clip; the disagreement-only shortcut is rejected.** When two
  recognisers mishear a Nigerian accent **the same way, they agree** — so the error is never surfaced
  and nobody checks it, which is precisely the failure the benchmark exists to find. Reviewing only
  disagreements would hide it while looking thorough

### Phase 0 — the decisions, the ADRs and the contracts · **done 2026-09-29**

- [x] **ADR-0019** — the agent drives the same engine in-process and pushes turns to the API
      (ADR-0016's open question, answered); the answer key never enters the room; spec §8's single
      latency figure replaced by two measurable ones; the lever ladder, cheapest first; the two calls
      never merged; a fallback needs no handover; a barged-in question records how far it was spoken
- [x] **ADR-0020** — synthetic eliminates and never chooses; two TTS sources so no recogniser is
      tested chiefly on its own vendor's audio; the real set's shape; the human reference pass; one
      pinned normalizer; the codec path is part of the test; WER **per speaker** because an average
      hides the one speaker a provider fails; streaming is a hard filter; the speakers are not users
- [x] **Spec §8 amended in place** — the latency bullet carries the two numbers and the arithmetic
      that made the old one unreachable, and the fairness bullet says what "Nigerian-accented speech"
      means. `docs/PROMPTS.md`'s M5 prompt corrected in the same change (CLAUDE.md §7.4): it asked for
      "LLM first token", which does not exist here — an AI call returns a whole schema-validated
      object and the asks guard counts a whole text before any of it is spoken
- [x] **The contracts phases 3 and 4 will implement** (`packages/shared-types/src/contracts/voice.ts`):
      `VoiceTokenResponse` (browser), and `VoiceSessionStartResponse`, `InterviewTurnPush`,
      `InterviewTurnPushResponse`, `VoiceLegEndedRequest`, `VoiceLegEndedResponse` in the registry, so
      the agent's side generates as Pydantic. Plus `VoiceTurnLatency`, `VoiceQuality`,
      `TranscriptWord` and `TurnVoice`, and `VOICE_LIMITS` for the numbers that are product rules
- [x] **`InterviewTurnPush` is `InterviewAdvanceResponse` arriving by the other door, minus two
      things**: no `error` field and a non-nullable snapshot, because a refused exchange produces no
      push at all. Tested in both directions
- [x] **`turn.voice` is `nullish`, and that is not laziness.** The generated Pydantic omits an unset
      optional or dumps it as `null`; the API validates every worker response with Zod. A contract
      accepting only one spelling of "nothing" would have failed every text interview the first time
      the other appeared. Three tests, one per spelling plus the populated case
- [x] **`TranscriptWord` does not validate that `end_ms` follows `start_ms`.** A recogniser emitting a
      zero-length or overlapping word must not cost the candidate a whole exchange over a number
      nobody reads directly; M6's metrics clamp instead, losing one word rather than one turn
- [x] Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (all nine workspaces; 454 worker tests),
      `pnpm format:check`, `pnpm check:contracts` — and the generated Pydantic read by hand to confirm
      `voice: TurnVoice | None = None`, which is what leaves text-mode construction untouched

### Carried into phase 1

- [ ] **`interview_llm_timeout_s` is 45 s, which is a text-mode number.** Nobody watching a spinner
      waits 45 s for one voice turn: by then the candidate has said "hello?" twice. Phase 3 needs its
      own, shorter, per-call budget, and a timeout must fall back to the pinned wording rather than to
      silence — the fallback path exists, but its _deadline_ does not
- [ ] **The 0.85 prompted-criterion adjustment and voice barge-in have not been thought about
      together.** A candidate who talks over a probe and answers it anyway was prompted; one who talks
      over it and answers something else was not asked. `session_turns.follow_up_index` records the
      probe as asked either way, and `spoken_ms` is the only evidence of how much they heard. Decide it
      in phase 3 with ADR-0018 open, and say so in the ADR if it changes anything
- [ ] **Nothing yet checks that `pricing.py` has a rate for a provider before a call is made.** Today
      an unknown `(provider, model)` logs a warning and records zero cost, which is tolerable for one
      LLM; it is not tolerable for a per-minute vendor where the bill arrives monthly. Phase 1 should
      refuse to start with an STT or TTS provider it cannot price

### Phase 1 — the adapters and their fakes · **done 2026-09-29**

- [x] **`SpeechToText` and `TextToSpeech` in `readi_worker/speech/`**, beside `LLMClient` and
      `EmbeddingProvider` and shaped like them: the Protocol is what business logic depends on, the
      SDK lives in the implementation, latency is measured inside the adapter, and `factory.py` is
      the only place a provider **name** becomes an implementation
- [x] **The protocols are batch, and that is the phase's real decision.** The live conversation runs
      on LiveKit Agents' plugin for the chosen provider — writing our own streaming stack beside it
      would be two implementations of one thing, and the plugin is what `AgentSession` expects to be
      handed. Phase 3 wraps that plugin for provider selection and `AiCallRecord` reporting, which is
      the same seam. What the batch interfaces are for is not small: the benchmark (phase 2), the
      pre-rendered interviewer audio that is the whole of latency lever 1, the voice panel (phase 7),
      and the fakes that let a voice e2e run with no key. **Say this in ADR-0019 at phase 3**, beside
      the barge-in decision below
- [x] **An unpriced provider cannot start** (owner's instruction, 2026-09-29). `Settings` refuses a
      configuration whose STT or TTS provider and model have no rate in `speech/pricing.py`. The
      reasoning is worth keeping: a language model bills per call, so an unpriced one shows up as a
      zero in a column somebody reads that day; recognition and synthesis bill per minute and per
      character, monthly, in arrears, so an unpriced one is a cost nobody sees until the invoice. The
      test is the shape of the real mistake — a provider added to the registry in phase 2 with its
      rate forgotten
- [x] **Prices are stored in the vendors' own units** — micro-USD per audio-minute, micro-USD per
      thousand characters — so checking the table against a pricing page is reading one number off
      each. The alternative is the Voyage rate: an estimate nobody could check at a glance, still
      marked unverified three milestones later
- [x] **`fake` is priced at zero rather than special-cased**, so the startup rule needs no exception
      and `LLM_PROVIDER=fake`'s "resting state costs nothing" holds for voice too
- [x] **`VOICE_ENABLED` decides whether the production `fake` refusal applies.** Refusing the fakes
      in production unconditionally would stop a **text-only** deployment booting — which is every
      deployment until this milestone ships — so the rule is "not in production _with voice on_"
- [x] **`content/glossary/tech_terms.txt`**, 302 terms drawn from what our own banks say and the
      stacks the catalogue offers. One file for two jobs — the recogniser's custom vocabulary and the
      benchmark's tech-term subset — so a provider cannot be tuned for the test without being tuned
      for the product. **Its order is its priority order**, because every provider caps keyterms and
      the loader keeps the first N and logs what it dropped
- [x] **The glossary test asserts the real shipped file** and found a duplicate on its first run
      (`rollback`, in two sections). A fixture would have passed
- [x] **`readi_worker/paths.py`**: one `repo_root()`, because the eval harness had its own and the
      glossary needed the same walk. The harness's version stays as a thin wrapper that keeps raising
      `DatasetError`
- [x] **Word timings in the fake are evenly spaced, deliberately.** Even spacing is a lie about real
      speech and it is the right lie here: M6's delivery metrics read these offsets, and a fake that
      invented pauses would make a pace test pass on the fake's rhythm rather than on the code
- [x] Checks: `ruff`, `mypy --strict`, 485 worker tests (31 new), `.env.example` and `turbo.json`
      updated with the nine new variables

### Carried into phase 3, with the owner's decision already taken

- [ ] **A probe counts as asked only if the candidate heard enough of it to know what it asked**
      (owner's decision, 2026-09-29; finding 2 of phase 0). Use `spoken_ms` against where the ask
      falls in the text: a probe cut off **before** its ask is treated as **not asked** — no 0.85
      discount, and "not assessed" if the criterion was never covered. It is the same principle as
      M4's clock rule: **a candidate never loses marks for something they did not hear.** Record it in
      ADR-0019 when phase 3 builds it
- [ ] **Amending ADR-0019 rather than superseding it is allowed here, and only here.** The repo's rule
      is that an accepted ADR is never edited — but ADR-0019 has never left this branch, and the
      prompts rule already says a version that has never left its own branch may be revised within its
      own milestone. Once M5 merges, a change to it is a new ADR. Say which one it is in the commit
      message either way
- [ ] **`INTERVIEW_LLM_TIMEOUT_S` is still 45 s**, which is a text-mode number (carried from phase 0)
- [ ] **The streaming adapters wrap LiveKit's plugins** — the batch protocols above do not cover them,
      and the wrapper is where `AiCallRecord` reporting for a live turn has to happen

### Phase 2, part 1 — the five vendors, priced and configured · **done 2026-09-29**

Handover: `docs/progress/2026-09-29-m5-providers.md`. Accounts: AssemblyAI, Deepgram, ElevenLabs,
LiveKit, Intron ("Sahara") — all free tiers but ElevenLabs Starter at $6/month. Every rate was read
from the vendor's own page on 2026-09-29 and carries that date and its URL in the code.

- [x] **`speech/providers.py` holds vendor _descriptors_, not a set of names.** Four things differ per
      vendor and each corrupts something silently if assumed: the billing basis, the keyterm cap, the
      unit of word offsets, and what keeps our audio out of their training set
- [x] **A rate is a (provider, model, path) with a basis.** Deepgram bills audio minutes; AssemblyAI
      streaming bills **socket-open** minutes — "a WebSocket open for 60 minutes with 30 minutes of
      audio sent is billed for 60 minutes", and an un-terminated session bills three hours. An
      interview is mostly silence, so one read as the other is ~3x wrong in our favour, which is the
      worst direction. `stt_cost_micro_usd` **raises** rather than guessing. Consequence: the agent
      closing its socket is an operational rule
- [x] **The same model costs different amounts on the two paths** (nova-3: $0.0077 live, $0.0043
      pre-recorded), which is why the path is in the key rather than in a comment
- [x] **The regular rate is stored, not the promotional one.** Deepgram's streaming promo ($0.0048 vs
      $0.0077) has no published end date; storing the promo would make every estimate come in under
      the invoice, which is the wrong direction for the same reason `_billable_seconds` rounds up
- [x] **302 terms, and no live path takes more than 100.** `glossary_for(settings, path)` applies the
      vendor's cap; Intron documents no custom-vocabulary feature and gets 0. The file's order is now
      a product decision about which words a candidate can afford to have misheard
- [x] **Privacy mechanisms are code where they can be**: `mip_opt_out=true` on every Deepgram call,
      AssemblyAI's **EU host** (the mechanism, not a latency choice),
      `use_disable_llm_corrections=true` for Intron. Where they cannot be — ElevenLabs' zero retention
      is Enterprise-only — it is a **declared gap**, and a test asserts every vendor declares one or
      the other
- [x] **An unpriced provider cannot start, and Intron is the live case**, not a hypothetical: they
      publish no rates anywhere, so the worker refuses to run with them configured
- [x] **168 Nigerian-accented ElevenLabs voices, 22 conversational**, all rate 1.0, most with a
      730-day notice period (`tools/list_voices.py`, which reads the key from configuration so it
      never reaches a command line or a transcript). `en-nigerian` being a first-class filter is why
      ElevenLabs is the synthesizer — Cartesia publishes nothing closer than `en-ZA` at the same price
- [x] Subprocessors updated with all five and the ElevenLabs gap; the worker's env template carries the
      keys, the priced models and the caps; CLAUDE.md §4 and §5; 24 pricing tests (39 speech tests)

### Phase 2, part 2 — still to do

- [ ] The four HTTP adapters (Deepgram, AssemblyAI, Intron batch; ElevenLabs batch), each converting
      its own timing unit — **Deepgram reports seconds, AssemblyAI milliseconds**
- [ ] The benchmark harness: manifest, the pinned normalizer, WER overall and **per speaker**,
      tech-term error rate, time-to-final, the provenance rule that refuses a mixed figure
- [ ] **The harness must refuse an unpriced provider too**, or record "cost unknown" rather than 0
      behind an explicit `--allow-unpriced`. Otherwise a free tier is an invisible bill — the same
      rule as startup, one level up
- [ ] **`--dry-run` prices in units, not just dollars**: audio-minutes per recogniser and characters
      for the synthesizer against each free allowance. On a free tier "you have 4,000 characters left
      this month" is the number that stops a run, not "$0.30"
- [ ] The synthetic pre-screen from **two** TTS sources, and the recording kit for phase 6
- [ ] **Intron's batch endpoint takes a file URL, not an upload**, and caps at 120 s — so the harness
      needs somewhere to serve a clip from, which no other vendor requires

### Owner's open questions, sent or to send (2026-09-29)

- [ ] **LiveKit: is a self-hosted agent billed as a participant minute or an agent session minute?**
      $0.0005/min against $0.01/min. Their docs define agent minutes for agents deployed _to their
      cloud_ and say nothing about ours
- [ ] **LiveKit: request region pinning and ask what they advise for Nigeria.** Their Africa group is
      one location in South Africa with no in-region redundancy, and pinning removes failover
- [ ] **Intron: price, and a written answer on retention and training for the voice API.** Their only
      policy and terms are dated January 2020, before the API existed. **No consented human recording
      may be sent to them until this is answered** — it is a gate on phase 6, not a note
- [ ] **Deepgram: are self-serve accounts in the Model Improvement Programme by default?** We opt out
      on every request either way; the answer belongs in the subprocessor file
- [x] **The API's LiveKit credentials are in place** (owner, confirmed 2026-09-30):
      `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` all read `set` in the API's own env
      file, checked with `scripts/env-has.sh`. They read `missing` on 2026-09-29 because they had
      gone into the worker's file twice. **Phase 4's one blocker is clear**

### Phase 2, part 2 — the adapters and the harness · **done 2026-09-29**

- [x] **Four adapters, each driven through a mock transport** (13 tests, no key, no network): Deepgram
      (one POST, seconds → milliseconds), AssemblyAI (upload → submit → poll, bounded), Intron (a URL,
      not bytes) and ElevenLabs (the non-streaming endpoint, for audio we generate once and keep)
- [x] **The protocol gained `audio_url`**, because one vendor cannot be given bytes at all: Intron's
      endpoint takes a readable URL. Every other adapter ignores it and Intron refuses by name, which
      beats a protocol that pretends all four vendors are alike
- [x] **The things the adapter tests actually assert** are the ones that cost money or break a promise:
      `mip_opt_out=true` on every Deepgram request, the EU host on every AssemblyAI request,
      `use_disable_llm_corrections=true` on every Intron request, `model_id` always sent to ElevenLabs
      (their default is the $0.08 model, not the $0.04 one), and the two timing units
- [x] **The harness**: manifest (provenance, speaker, first language, variety, device, voice, reference
      source), the pinned normalizer, WER pooled and per speaker, tech-term error rate over the
      glossary, filler retention, and a report that **refuses** to pool synthetic with real
- [x] **`--smoke` scores a set it generates for itself, and the numbers are exact** (0%, 27.3%, 9.1%;
      pooled 12.5%, term error 20%, fillers 0%). The three hypotheses are deliberate perturbations of
      their references, so the figures move only if the normalizer or the alignment moves — a stand-in
      returning something unrelated scores ~100% and proves only that the pipeline runs
- [x] **The normalizer's first version corrupted its own inputs.** A plain substring alias replace
      turned "requests" into "requestypescript" (`ts` → `typescript`) and cascaded "postgres" →
      "postgresql" → "postgresqlsql". Caught by printing eight sentences through it before anything
      depended on the output; aliases are word-boundary regexes now and the test names the bug
- [x] **Two gaps the kit draft found in it, both fixed**: bracketed markers (`[unintelligible]`) are
      dropped, or each one is a free error against a recogniser that had nothing to write down; and
      integers below 1,000 are written as words on both sides, so `80` and `eighty` compare equal.
      Above 999 it does not and cannot — "2026" is two different sentences — so the convention carries
      that as a rule for people
- [x] **An unpriced provider does not run** (`--allow-unpriced` stamps every cost as a floor), and **a
      draft reference does not pass as a measurement** (`--allow-draft` stamps the report). Both refuse
      by default, both with the reason in the message
- [x] **`--dry-run` prices in units against the free allowance**, not only in dollars: "6,184 of 30,000
      characters (20.6%)" is what stops a run on a free tier. ElevenLabs' allowance is recorded as the
      **smaller** of their two published figures, for the same reason a billed second rounds up
- [x] **A smoke run writes beside its own generated clips**, never into `evals/stt_benchmark/results/`:
      `pnpm test` calls it every run and a harness that litters its own result directory is ignored
- [x] The recording kit, drafted and then checked by hand: script (Part A verbatim, dense in glossary
      terms), consent form (a **draft for a lawyer**, vendor table accurate against the subprocessors
      file), phone instructions, transcription convention. `evals/stt_benchmark/README.md` is the guide
- [x] Checks: ruff, `mypy --strict`, 536 worker tests (39 new), `pnpm format:check`

### Phase 2's decisions, settled by the owner 2026-09-30

- [x] **Deepgram is not gated on their written answer** (owner, 2026-09-30). The opt-out is a parameter
      we send on **every** request and a test asserts no request can be built without it, so their
      default enrolment governs only requests that omit it — of which there are none. The written answer
      is still owed for the subprocessor file, as record-keeping rather than as a condition on a clip
- [x] **The control is two ElevenLabs voice groups, not a second vendor** (owner, 2026-09-30). Two
      Nigerian-accented voices and two general-accent voices from the same vendor, so the accent delta is
      measured with synthesis artefacts held constant — a better control for _accent_, a worse one for
      _vendor_. **A second TTS vendor is owed before any provider is eliminated on synthetic evidence**,
      and the run's own notes say so
- [x] **Benchmark audio is kept 12 months; the transcript and the figures are kept after it is
      deleted, unless the speaker objects** (owner, 2026-09-30). A vendor changes its model and the set
      has to stay re-runnable to be comparable; the transcript and figures are the record of how a
      recogniser was chosen. Written into `kit/consent-form.md` and the placeholder is gone — what
      remains for the lawyer is whether it is expressible as drafted
- [ ] **Intron is blocked on two things, not one.** Their unanswered data terms (their only policy
      predates the voice API by six years), **and** their endpoint taking a **file URL rather than an
      upload** — so a clip has to be reachable from the internet, the only vendor needing somewhere to
      serve from. A temporary tunnel or a bucket with expiring links, decided when their answer arrives

### The pre-screen, priced and waiting on the owner (2026-09-29, unchanged)

Handover: `docs/progress/2026-09-30-m5-phase-2.md`, which carries the three commands ready to paste.

- [ ] **48 clips, 6,184 characters, $0.2474, 20.6% of the month's ElevenLabs allowance**, plus about
      **$0.05** to transcribe them (6.8 minutes of audio against credits of $200 and $50). The whole
      pre-screen is about **30 cents**, and the binding constraint is the character quota rather than
      money. `--sentences 8` is the cheaper variant: ~$0.16 and 13.7%, at the cost of a thinner
      technical-term figure
- [ ] **Step 2 is free and must be read before step 3**: the real audio durations only exist once the
      clips do, so the dry run after synthesis is the figure that decides whether `--max-cost 0.15` is
      right
- [ ] **The recording kit needs five placeholders only the owner can fill**: legal entity name and
      registration number, privacy contact email, postal address, the upload link, and the payment
      amount (or "none"). And the gate: **no recording is made until a lawyer has reviewed the consent
      form** (ADR-0020 §8)

### Phase 3 — the voice agent · **done 2026-09-30**

Handover: `docs/progress/2026-09-30-m5-phase-3.md`. ADR-0019 **amended in four places** rather than
superseded (allowed only because it has never left this branch, and the commit message says so).

- [x] **`livekit-agents==1.8.2`, and that is the whole dependency.** It carries voice activity
      detection and the end-of-turn detector inside it (`livekit-local-inference`, compiled into the
      wheel): no ONNX runtime, no plugin, no model download, which is three things less than ADR-0019
      §2 expected. One release two weeks old, per the version policy
- [x] **The session is given no language model, and that is `voice is a transport` enforced rather
      than asserted.** With `llm=None` LiveKit runs streaming recognition, endpointing, barge-in,
      transcription into the room and reconnection, calls `on_user_turn_completed` and then stops;
      `generate_reply()` raises, which is the right failure for a call nothing there should make
- [x] **`voice/session.py` is the leg and has no LiveKit in it.** Four Protocols in
      `voice/transport.py` and a speaker that records lines and answers with scripted playback: **25
      tests drive whole legs** — the greeting, an exchange, barge-in, the silence prompt, the
      prefetch, ending, the allowance, a lost push — with no room, no server, no microphone, no key
- [x] **A probe counts as asked only if the candidate heard its ask** (owner's decision, 2026-09-29,
      built here). A turn talked over before its ask pushes `follow_up_index: null`, so the criterion
      is **not assessed**; the engine's `probes_asked` still holds it, so the cap counts it and it is
      not re-asked — the candidate's act spends the probe and does not score them
- [x] **Three boundaries on that rule, each written down.** LiveKit's `synchronized_transcript`
      makes it an exact prefix comparison where a room session provides one; otherwise the played
      position is mapped onto the text with one clipped syllable of tolerance; and **anything less
      certain counts as not heard**, because judging an unheard ask "heard" scores a candidate on a
      criterion nobody put to them while the reverse costs only a data point
- [x] **The acknowledgement set is eight lines, rotated like `transitions.py`'s connective, and the
      no-praise test owns its own word list.** A list the module owned could be narrowed in the same
      commit that widened the set and would then pass by agreeing with itself. `"Alright."` is in and
      `"Right."` is out, and the whole-word filter is why the first is safe — a candidate who has just
      been wrong would hear the second as agreement
- [x] **Lever 1 is the acknowledgement and two lines beside it, not the connectives.** A connective
      arrives _inside_ the phrasing call's output, so it cannot be split off a turn reliably; lever 2
      covers the opening's audio better by rendering the whole turn
- [x] **Lever 2 only fires where the answer cannot change what happens next.**
      `machine.settled_next_step` is the rule, and every condition it rests on is monotone: time runs
      down, the cap never loosens, coverage only removes probes from play. The phrasing is made by the
      **service**, through the same renderer the turn uses, and cached on the rendered prompt — so a
      prefetch that misses is a wasted call and never a second copy of the question prompt
- [x] **The push waits for the turn's audio to settle, and pushes are serialised.** Nothing sits
      between the model's answer and the first audio byte, but `spoken_ms` and `interrupted` do not
      exist until the audio stops — and two pushes in flight could apply an older snapshot over a
      newer one, which is what the next leg resumes from
- [x] **Cost records for the live path come from LiveKit's own `STTMetrics`/`TTSMetrics`**, not from a
      wrapper around a plugin, so nothing there can happen without an `AiCallRecord`. A
      **session-billed** vendor produces one record when the socket closes, priced on the socket's
      lifetime; an audio-billed one produces one per recognition. The units column stays the audio
      either way, because a row has to be able to show both
- [x] **LiveKit Inference is deliberately not used.** It would reach the same vendors through
      LiveKit's gateway at rates `speech/pricing.py` does not hold — an unpriceable call, which is the
      one thing the owner's instruction of 2026-09-29 forbids
- [x] **`VOICE_LLM_TIMEOUT_S` = 10 s** (the item carried from phases 0 and 1). 45 s is right for
      somebody watching a spinner and absurd in a conversation; a call past it falls back to the
      pinned staff-written wording rather than to silence
- [x] **A voice deployment refuses to start without LiveKit credentials**, and only when
      `VOICE_ENABLED=true` — a candidate pressing the button and getting nothing is a worse failure
      than a boot that names the variable
- [x] **`VoiceLegEndReason` gained `allowance_exhausted`.** The agent is told how many voice seconds
      the session has left and closes the leg before crossing that line, and what that is is neither
      an error nor a poor connection
- [x] **Proved against the LiveKit dev server**: the agent registers as `readi-interviewer`, a
      dispatch carrying `{"session_id": …}` reaches the entrypoint, the session id is read from it,
      and the pull from the API fails cleanly (no API yet — that is phase 4) with one log line and no
      traceback
- [x] **Two bugs the tests found, both in the mapping rather than the logic.** A `TimedString` with
      no offsets carries `NOT_GIVEN` rather than None, so the null check crashed the recognition
      stream on the first loosely-timed word — one word's worth of coaching against a whole leg. And
      the barge-in tolerance was written as a margin _beyond_ the ask, which made a question played
      to its last character count as unheard whenever the candidate interrupted at the end
- [x] Checks: `ruff`, `mypy --strict`, **667 worker tests** (131 new), `pnpm lint`, `pnpm typecheck`,
      `pnpm test`, `pnpm format:check`, `pnpm check:contracts`

### The question-repeat rule · **done 2026-09-30**

The owner's follow-up on phase 3's known gap, built in phase 3 rather than 4 because none of it is
API work. ADR-0019 §8's amendment carries the decision and the rejected alternative.

- [x] **An unheard _question_ is asked again** (owner's follow-up, 2026-09-30; built in phase 3
      rather than 4, because none of it is API work). The probe rule cannot help there — the criterion
      an opening prompt asks for carries no probe, so it is never in `unaskedCriteria` — so the
      question is **put again**, once, from the same words and the same audio: no model call, so a
      repeat cannot become a different question. Not scoring it would also have worked and is worse:
      the candidate loses the marks either way and the interview loses the answer too
- [x] **The other half of that rule: words that ended before the question did are not an answer to
      it.** The interjection the candidate made over the question commits a moment after the repeat
      starts, and taking it would score "sorry, what?" and waste the repeat. Dropped, with a log line
      and no transcript
- [x] **One repeat per question**, and past the cap their words are taken as the answer. A candidate
      who talks over everything must not spend the session on one question and be scored on nothing —
      the clock would end it either way, but with nothing to score
- [x] **Only a question is repeated, never a probe.** The probe rule already protects the candidate
      from being scored on one they did not hear, and re-asking something they deliberately talked
      over is an interviewer who had not noticed
- [x] **Holding the interruption until the ask lands was rejected, on the source.** It reads better
      and LiveKit supports it — but a candidate turn that commits while the current speech cannot be
      interrupted is **dropped entirely** (`agent_activity.py:2774-2779`: a warning and a `return`
      before the hook runs), so the failure mode is a candidate answering and being unheard. A worse
      bug than the one being fixed, and a silent one
- [x] Checks: `ruff`, `mypy --strict`, **679 worker tests** (12 new), `pnpm lint`, `pnpm typecheck`,
      `pnpm test`, `pnpm format:check`

### Carried into phase 4

- [ ] **The three internal routes do not exist yet**, so nothing has run end to end through a room.
      `voice/api_client.py` is written against the contracts and driven in tests through a mock
      transport; the first real leg is phase 4 plus phase 5's browser
- [ ] **A resumed leg says nothing and waits**, which is what `VoiceSessionStartResponse` documents —
      but on a voice reconnection the candidate heard nothing of the question they are now expected to
      answer. The captions carry it (phase 5), so silence costs them a read rather than a
      repetition; re-speaking it would need the API to send the last interviewer turn, which the
      contract does not carry. Decide it with the captions in front of you
- [ ] **RTT and packet loss are left null on `VoiceQuality`.** They would have to be read out of
      `room.get_rtc_stats()`'s WebRTC objects, and the measurement that decides the region is phase 8
      stage 1 — the candidate's _browser_ reporting `getStats()` over MTN, Airtel, Glo and home
      broadband. `QualityMonitor.note()` already takes them, so phase 8 adds a call and not a design
- [ ] **No vendor plugin is installed**, because no vendor is chosen (phase 6, ADR-0020). The live
      path runs on the fakes; `voice/streaming.py` names the extra each provider needs

### Carried into phase 5 from the repeat rule

- [ ] **The captions will show what the transcript does not.** LiveKit transcribes the candidate's
      own speech into the room independently of us, so a dropped interjection appears on screen and
      then in no turn of the stored transcript. The interviewer visibly re-asks, which explains it —
      but decide it with the captions in front of you (phase 5), because the alternative is showing
      the candidate words we then throw away
- [ ] **Past the cap, an unheard question is still scored.** Two barge-ins over the same question and
      the second answer is taken as given. It is the best remaining option and it is not free; the
      pilot can say how often two happen

### Phase 4 — the API's half · **done 2026-09-30**

Handover: `docs/progress/2026-09-30-m5-phase-4.md`. ADR-0019 amended a third time (§3 again, and a new
§9); spec §4.3, §4.4, §9 and §10 amended in the same change.

- [x] **`POST /api/interviews/:id/voice-token`** — the candidate's one door. Ownership first (another
      candidate's session is a 404, not a 403), then the session's own facts (`interview_ended`,
      `interview_expired`, `voice_not_enabled` for a text session), then `audio_processing` at its
      **current** version, then the allowance. The token authorises **joining** for
      `VOICE_LIMITS.tokenTtlSeconds`; `ends_at` is what ends the interview
- [x] **Voice is refused at session creation, not at the microphone.** A session pinned as `voice` that
      can never be joined has spent four questions of that candidate's bank on nothing, and those
      questions then count as seen for the next twenty sessions (`withHistory`). The token route asks
      again, because an allowance can run out between the two. `CreateInterviewRequest.mode` is the new
      field and `interview_sessions.mode` is written from it once, for good
- [x] **The three internal routes**, behind `@ServiceOnly()` — and that marker is a **second global
      guard**, not `@Public()` with a check inside it. `@Public()` would have said in the metadata that
      an internal route is public, which is the opposite of true, and default-deny would then have
      rested on a decorator somebody could forget. The two guards partition every route, so one with no
      marker at all is still refused by `AuthGuard`
- [x] **The guard accepted a bare token, and now does not.** `header.replace(/^Bearer /i, "")` treats a
      raw token as a well-formed header; harmless on its own — you still need the token — and exactly
      the leniency that ends up being how a token arrives somewhere it should not. The scheme is
      required, the comparison is constant-time, and a wrong **length** is a 401 rather than the crash
      `timingSafeEqual` would have thrown (which would have leaked the length through the status)
- [x] **A push is made idempotent by a table, because two of its three payloads have no natural key.**
      The turns were already safe (`(session_id, seq)`, engine-allocated) and so are the latency samples
      (`(session_id, turn_seq)`) — but **`ai_call_log` has none**, so a retry billed the same model
      calls twice and every cost figure after it would have been a number taken on trust. That is the
      whole of `voice_exchanges`: the agent's `exchange_id` is its primary key, the insert is the claim,
      and a collision is the `duplicate: true` the agent already expects
- [x] **One write path.** The push goes through the **same** `applyExchange` text mode uses — one
      definition of what a turn is, and no second place where `follow_ups_asked` is recounted. What
      voice adds is per-turn timings taken from its own samples: an interviewer turn began at its first
      audio byte (`speech_ended_at + response_ms`) and lasted as long as it was **spoken** for, which is
      what the candidate experienced, including a turn they cut off half way. A candidate turn keeps the
      text-mode derivation, which spans the time they were really talking — what M6 reads
- [x] **Word timings, `spoken_ms` and `interrupted` are columns on `session_turns`** (`voice_words`
      JSON, nullable throughout). Nullable rather than defaulted, because a null `interrupted` means "we
      do not know, nobody was speaking" and `false` would be a claim
- [x] **`usage_ledger` meters SECONDS, not minutes** (ADR-0019 §9; spec §10 amended). A leg is not a
      session: a candidate who reconnects three times spends three legs of forty seconds, and rounding
      each leg up to a minute would meter three minutes they never used — for reconnecting, which is
      what a Nigerian mobile connection does. Rounding happens once, where a candidate is _shown_ their
      allowance. `source_id` is the `voice_legs.id`, unique, so a retried report meters nothing twice
- [x] **A leg that spent no seconds writes no ledger row**, which is not the same as a zero row: the
      ledger records what was used, and a room nobody joined used nothing. The **leg** row is still
      written, because a room nobody joined is a fact worth having
- [x] **The allowance is a `SUM` over the ledger, never a counter.** A counter has to be right on every
      path, including the ones that fail half way; the ledger is append-only and each row names what
      produced it. `VoiceAllowanceService` is M8's seam and the whole of it — M8 changes where the
      figure comes from (`entitlements`) and nothing else moves
- [x] **The fallback is a `voice_legs` row with a reason**, not a change of `mode` (ADR-0019 §7). The
      int test asserts both halves: the session still says `voice`, and the interview really does carry
      on at the same turn over SSE
- [x] **`GET /api/admin/voice/latency` (+ `/:id`)** — p50/p95 per stage per session and a per-turn
      table, admin-only and naming **no candidate at all**. A stage with no samples is **null, not
      zero**, and every stage carries its own `n`: most stages are legitimately absent, and the whole
      effect of lever 2 is that `phrasing_ms` _disappears_ on a prefetched opening. `quantile` is
      imported from `interviews/pace.ts` rather than written again, so the admin view and phase 8's
      report cannot round differently on the same run
- [x] **The room joins the leak test** (ADR-0019 §4). A recording stand-in for LiveKit keeps every
      payload the API handed it and the detector runs over all of it; the dispatch is asserted to have
      exactly the two fields it has, and the room name and participant identity are asserted to come
      from the **session** — a user id would link every room that candidate has ever been in. The
      worker's own channel is asserted from the other side: the bundle route **must** carry the probes
      and must still carry no rubric, with `criterion_count` and a probe's `criterion` allowed **by
      name** because both are numbers, and a control proving that allowance is not a widening
- [x] **The internal routes are excluded from the OpenAPI document**, so the coverage test cannot
      enumerate them — a test now asserts the document publishes no `/api/internal` path, so removing
      the exclusion fails and has to be argued for
- [x] **`audio_processing` went to v2** (owner's decision 9). v1 said only that speech is converted to
      text; it did not say a recognition provider receives everything the candidate says, that only the
      interviewer's own words reach a synthesizer, or that **no audio is stored at all** without
      `recording_storage`. Bumping it now costs nothing because there are no real accounts; after the
      pilot it sends every candidate back to the consent screen
- [x] **The sixth `DROP INDEX questions_embedding_hnsw`**, in a migration that touches neither
      `questions` nor a vector. Deleted, with the reason in the file; `migration-sql.spec.ts` would have
      failed the build, which is why that test exists rather than eyes
- [x] `livekit-server-sdk@2.19.0` and `@livekit/protocol@1.51.0` are the only new dependencies — the
      grant shape and the Twirp envelope of the agent-dispatch API are two details we would get wrong
      once, and both are LiveKit's own. No install-time build script, so no `allowBuilds` entry
- [x] Checks: `pnpm lint`, `pnpm typecheck`, **712 API tests** (54 new), 679 worker, 176 web, 141
      shared-types, `pnpm format:check`, `pnpm test:e2e` (10 passed, 6 skipped as designed)

### Two things phase 4 fixed that were nothing to do with voice

- [x] **`consents.service.spec.ts` hardcoded `version: 1` for every type.** Bumping `audio_processing`
      broke three of its tests for a reason unrelated to what they assert. The fixture reads
      `CONSENT_VERSIONS[type]` now: a fixture that hardcodes "current" stops being a fixture the first
      time current moves
- [x] **`consent-copy.ts` built a key union that could not be satisfied.**
      `consent.types.${type}.v${CONSENT_VERSIONS[type]}` over the whole union expands to every type at
      every version, so `recording_storage.v2` was demanded and no copy answers it. A **mapped type**
      fixes it — inside one, `T` is a single type and `CONSENT_VERSIONS[T]` is that type's own version —
      and the compile-time check the file exists for is kept rather than cast away

### Carried into phase 5

- [ ] **A resumed leg says nothing and waits** (from phase 3). On a voice reconnection the candidate
      heard nothing of the question they are now expected to answer. The captions carry it, so silence
      costs them a read rather than a repetition; re-speaking would need the API to send the last
      interviewer turn, which `VoiceSessionStartResponse` does not carry. Decide it with the captions in
      front of you
- [ ] **The captions will show what the transcript does not** (from phase 3): a dropped interjection
      appears on screen and then in no stored turn
- [ ] **Past the cap, an unheard question is still scored** (from phase 3)
- [ ] **Nothing has run end to end through a room yet.** The API's half is tested against the contracts
      and the agent's half against Protocols; the first real leg needs phase 5's browser. The int spec's
      pushes are hand-built, which proves the shapes the contracts describe and not that the agent
      builds them
- [ ] **`/admin/voice` is captured empty**, because `VOICE_ENABLED` is false in the e2e environment and
      no voice session can be started there. Its empty state is the right thing to photograph now; phase
      8 is when it has numbers in it. A voice e2e with a fake media device (phase 5) is what would let
      the screen be captured with a real measurement in it
- [ ] **The `LiveKitRoom` dispatch rule is unit-tested and has never met LiveKit.** `listDispatch`
      before `createDispatch` is asserted against a double; that a **reload** really produces one
      interviewer rather than two is phase 5's browser and phase 8's staging deployment

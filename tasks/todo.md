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

### Phase 4 — verification and docs

- [ ] 80 "after" screenshots, reviewed against Phase 0
- [ ] Slow 4G re-measured and reported against the Phase 0 baseline (expect +55.8 KB of fonts)
- [ ] `pnpm lint`, `typecheck`, `format:check`, `test`, `build`, `check:contracts`, `test:e2e`
- [ ] Docs: CLAUDE.md §6 conventions, README, `packages/ui` description, this file,
      `docs/progress/2026-09-20-d1.md`. No `subprocessors.md` change — the fonts are self-hosted

## Carried forward

- M1: install Playwright with the first e2e test (email signup → onboarding). Right after Playwright is
  added to the repo, tell the owner to install Chromium's system libraries by running:
  `sudo env "PATH=$PATH" pnpm exec playwright install-deps chromium`
  (`sudo` alone cannot see pnpm, which nvm installs under the home folder). Until then, the
  `mcr.microsoft.com/playwright:v1.62.1-noble` image with `--network host` works (used for the M0 360px check).
- M10: PNG PWA icons (192/512, maskable), Lighthouse pass (landing page ships ~180 KB gzip JS today).
- M10: Sentry source-map upload (`@sentry/cli` build script is denied until then).

## Repository

- Done (owner, 2026-09-19): the old Windows `origin` was removed; `origin` is now the private GitHub repo
  `git@github.com:aydeggy-dot/readi.git`, with `main` and `feat/m0-scaffold` pushed. No remote action needed.
- The owner pushes; Claude commits locally and does not push unless asked.
- 2026-09-19 (M1 phase 2 start): GitHub `main` was still `80ef242` (M0 not merged there yet), so there was
  nothing to rebase; `feat/m1-auth-onboarding` stacks on the M0 commits. After M0 lands on `main`: a
  merge commit or fast-forward needs no action; after a squash merge run
  `git rebase --onto origin/main feat/m0-scaffold feat/m1-auth-onboarding`.

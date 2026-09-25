# Implementation status, architecture and dependencies

**Readi** — AI-powered tech interview preparation — Nigeria first

*A complete account of what has been built, what remains, and what the owner must provide.*

|  |  |
| --- | --- |
| Date | 24 September 2026 |
| Repository | /home/hp/projects/readi |
| Branch examined | content/catalogue-banks (15 commits ahead of main, working tree clean) |
| Commit | 9a646ec — "docs(progress): handover for the planned-follow-up field and the QA pilot" |
| Last merge to main | 00daa6f — milestone M2.5 |
| Method | Every statement below was read from the repository: source, schema, migrations, tests, documents and git history. Nothing was inferred from the plan alone. |

Companion documents in the repository: `docs/PRODUCT_SPEC.md` (the product specification), `docs/PROMPTS.md` (the milestone build plan), `docs/adr/` (fifteen architecture decision records), `docs/progress/` (milestone handovers), `CLAUDE.md` (the engineering rules this codebase is held to).

## Contents

- [1. Executive summary](#1-executive-summary)
  - [1.1 Status at a glance](#11-status-at-a-glance)
  - [1.2 The project in numbers](#12-the-project-in-numbers)
  - [1.3 The five things worth knowing](#13-the-five-things-worth-knowing)
- [2. How to read this document](#2-how-to-read-this-document)
- [3. The product](#3-the-product)
  - [3.1 What it is](#31-what-it-is)
  - [3.2 Who it is for](#32-who-it-is-for)
  - [3.3 The principles the code is held to](#33-the-principles-the-code-is-held-to)
  - [3.4 Launch scope](#34-launch-scope)
- [4. Architecture](#4-architecture)
  - [4.1 The three applications](#41-the-three-applications)
  - [4.2 The shared packages](#42-the-shared-packages)
  - [4.3 Contracts and code generation](#43-contracts-and-code-generation)
  - [4.4 Local infrastructure](#44-local-infrastructure)
  - [4.5 Decisions of record](#45-decisions-of-record)
- [5. What is implemented today](#5-what-is-implemented-today)
  - [5.1 What a candidate can do today](#51-what-a-candidate-can-do-today)
  - [5.2 The API](#52-the-api)
  - [5.3 The database](#53-the-database)
  - [5.4 The web application](#54-the-web-application)
  - [5.5 The AI worker](#55-the-ai-worker)
  - [5.6 Content, the CMS, and the question banks](#56-content-the-cms-and-the-question-banks)
  - [5.7 Privacy and data protection](#57-privacy-and-data-protection)
  - [5.8 Testing and continuous integration](#58-testing-and-continuous-integration)
- [6. What is outstanding](#6-what-is-outstanding)
  - [6.1 M3 — the interview engine, in text mode](#61-m3--the-interview-engine-in-text-mode)
  - [6.2 M4 and M6 — evaluation, reports and the readiness score](#62-m4-and-m6--evaluation-reports-and-the-readiness-score)
  - [6.3 M5 — voice mode](#63-m5--voice-mode)
  - [6.4 M7 to M10, and phase 2](#64-m7-to-m10-and-phase-2)
  - [6.5 The content programme](#65-the-content-programme)
  - [6.6 Technical debt already recorded](#66-technical-debt-already-recorded)
  - [6.7 Decisions only the owner can make](#67-decisions-only-the-owner-can-make)
- [7. What you need to provide, and when](#7-what-you-need-to-provide-and-when)
  - [7.1 Already held, or generated locally](#71-already-held-or-generated-locally)
  - [7.2 Needed to finish milestone M3](#72-needed-to-finish-milestone-m3)
  - [7.3 Needed before anything is public](#73-needed-before-anything-is-public)
  - [7.4 Needed at later milestones](#74-needed-at-later-milestones)
  - [7.5 How costs arise](#75-how-costs-arise)
  - [7.6 Local prerequisites](#76-local-prerequisites)
  - [7.7 Environment variables](#77-environment-variables)
  - [7.8 Hosting — the decision that has not been made](#78-hosting--the-decision-that-has-not-been-made)
- [8. Risks, and where to spend attention](#8-risks-and-where-to-spend-attention)
  - [8.1 A suggested order](#81-a-suggested-order)
- [9. Appendices](#9-appendices)
  - [Appendix A — Every API route](#appendix-a--every-api-route)
  - [Appendix B — Commands](#appendix-b--commands)
  - [Appendix C — Terms used in this document](#appendix-c--terms-used-in-this-document)

## 1. Executive summary

Readi is an interview-preparation platform for African tech talent: a candidate chooses a target role, practises realistic mock interviews with an AI interviewer that asks follow-up questions, and receives rubric-based feedback and a readiness score. The plan is an eleven-milestone build (M0–M10) followed by a phase-2 programme.

**Five of those milestones are finished, reviewed and merged.** The platform today has a complete account system, onboarding, CV parsing, a full content management system with versioning and an approval workflow, a catalogue of roles and levels that staff can extend without a developer, and a privacy regime — consent, export, deletion — that was built before there was any personal data to protect. It carries roughly 712 automated tests plus an end-to-end browser suite, and it is designed and measured for a 360-pixel phone on a throttled connection.

**The interview itself is not built.** The state machine, the evaluator, the readiness score, the study plan and billing are specified in unusual detail — down to the state names, the scoring guardrails and the database columns — but not a line of them is written. That work is milestones M3 to M8. The next milestone, M3, has a six-phase plan and four decisions already taken by the owner.

**Nothing external is blocking the build.** The default configuration reaches no paid service: a fake language model, fake embeddings, console email and SMS, and local containers for Postgres, Redis, object storage and LiveKit. One item is needed to finish the next milestone (a Langfuse EU project), and a cluster of about nine items — domain, email domain verification, an approved Nigerian SMS sender ID, object storage, a hosting decision — is needed before anything can go in front of the public.

### 1.1 Status at a glance

| Area | State | Milestone |
| --- | --- | --- |
| Monorepo, local infrastructure, CI, contract generation | Built and merged | M0 |
| Sign-up and sign-in: email, Google, Nigerian phone OTP | Built and merged | M1 |
| Career profile, CV upload and LLM parsing, consent | Built and merged | M1 |
| Data export, account deletion, erasure sweep | Built and merged | M1 |
| The Margin visual identity and design tokens | Built and merged | D1 |
| Content model, admin CMS, workflow, version history, embeddings | Built and merged | M2 |
| Roles, levels and stack variants as editable content | Built and merged | M2.5 |
| Question banks — 104 questions, 102 rubrics | Drafted on a branch; unreviewed, unmerged | — |
| Interview engine, text mode, diagnostic interview | Not started — planned in detail | M3 |
| Evaluation, session report, eval harness, calibration | Not started | M4 |
| Voice mode, LiveKit, speech-to-text accent benchmark | Not started | M5 |
| Delivery metrics, readiness score, candidate dashboard | Not started | M6 |
| Study plan and the candidate-facing lesson experience | Not started | M7 |
| Billing: Paystack, Stripe, entitlements, usage metering | Not started | M8 |
| Feedback loop, analytics, admin operations | Configured but disabled; features not started | M9 |
| Hardening, legal pages, deployment, launch checklist | Not started | M10 |
| Mobile app, coding interviews, camera coaching, organisations | Not started | Phase 2 |

### 1.2 The project in numbers

|  |  |  |  |
| --- | --- | --- | --- |
| Database tables | 28 | Migrations applied | 12 |
| API routes | 59 (3 public) | Web page routes | 42 |
| NestJS modules | 19 (7 domain modules still to come) | Web components | 51 |
| Shared Zod contract modules | 11 | OpenAPI paths / components | 40 / 109 |
| Automated tests (TypeScript) | ≈635 | Automated tests (Python) | 77 |
| End-to-end Playwright specs | 6 (2 on demand) | User-facing copy keys | 585 |
| Questions written | 104 | Rubrics | 102 |
| Roles / levels / stack variants | 4 / 3 / 23 | Topics | 29 |
| Architecture decision records | 15 accepted | Progress documents | 11 |

### 1.3 The five things worth knowing

1. **The foundations are unusually complete for this stage.** Version history, an audit log, a leak test that walks the OpenAPI document to prove no answer key reaches a candidate, a contract-drift check across three languages, a colour-contrast gate, a font-weight budget — these are normally retrofitted, and here they came first.
2. **The centre of the product is still a specification.** Everything a candidate would actually come for — the interview, the feedback, the score — is milestone M3 onward. The landing page says so in its own copy, deliberately.
3. **All 104 questions are a model’s draft and no human expert has reviewed any of them.** The system refuses to publish them in production without an explicit, audited acknowledgement. Expert review is a real cost and a real lead time, and it is not on the engineering plan.
4. **The readiness score has an unfinished formula.** Its shape is fixed (technical 40%, behavioural 25%, communication 20%, coverage 15%) but several constants and edge cases are deliberately unresolved and need product sign-off before version 1 is final.
5. **Where this will be hosted has not been decided.** That decision carries three others with it — managed Postgres with pgvector, managed Redis, and an edge that sets a trustworthy client-IP header, without which the authentication rate limits do not work at all.

## 2. How to read this document

This document has three jobs, and they map to sections 5, 6 and 7:

- **Section 5 — what is implemented.** Every module, route, table and test that exists today, with the rules the code enforces.
- **Section 6 — what is outstanding.** The remaining milestones in the order they are planned, at enough depth to judge effort, plus the technical debt and open decisions already recorded.
- **Section 7 — dependencies.** Everything the owner must sign up for, verify, generate or decide, sorted by when it is needed rather than by vendor.

Sections 3 and 4 set up the product and the architecture; section 8 gives risks and a recommended order of work; section 9 holds reference material — the full endpoint list, the environment variables, the commands and the decision records.

> **On confidence**
>
> Where the repository states something, this document states it. Where the repository is silent — hosting, prices, vendor lead times — this document says it is silent rather than filling the gap.
>
> Two figures are flagged in the code itself as unverified: the Voyage AI embedding price, and the estimate of 2–4 US cents per 30-minute text interview. Both are the engineers’ own estimates awaiting a first real invoice.

## 3. The product

### 3.1 What it is

A candidate chooses a target role — Frontend, Backend, QA or Full-stack at launch — and a level, and optionally the technology variant they are interviewing for. They get a personalised preparation programme and practise realistic mock interviews with an AI interviewer that asks follow-up questions. After each session they receive rubric-based feedback that quotes what they actually said, delivery coaching, and an updated readiness score.

The north-star metric is the share of active candidates who report an interview offer within 90 days of reaching the “Ready” band.

### 3.2 Who it is for

| Persona | Who they are | What they need |
| --- | --- | --- |
| Early-career candidate | Bootcamp graduate or junior developer in Nigeria, mostly on Android, limited data | Affordable, structured practice and honest feedback |
| Mid-level switcher | Two to five years’ experience, targeting remote roles abroad | Foreign-style interviews, system design, negotiation |
| Cohort learner | Enrolled through a bootcamp, hub, university or government programme | A seat from an organisation; visible progress |
| Content expert | A senior engineer contracted to write and review questions | An efficient authoring and review workflow |
| Platform admin | Readi staff | Users, plans, content, flags, refunds |

### 3.3 The principles the code is held to

- **Quality of feedback beats flashy features.** Feedback must be specific, must cite what the candidate said, and must be fair.
- **Coach, never cheat.** No feature will ever assist a candidate during a real, live interview. This is written into the specification as out of scope, alongside emotion or personality inference from face or voice.
- **Built for Nigerian conditions.** Mobile-first layouts tested at 360 pixels, low-bandwidth friendly, accent-robust speech, Naira pricing.
- **Privacy by default.** Camera features are opt-in and processed on the device; no raw video leaves it.
- **Transparent billing.** Clear renewal reminders, one-click cancellation, no dark patterns.

### 3.4 Launch scope

| Dimension | At launch (MVP) | Later |
| --- | --- | --- |
| Roles | Frontend, Backend, QA, Full-stack — as editable content, not code | AI/LLM, DevOps/Cloud, Mobile, Data, Security, Support, TPM |
| Levels | Intern/Junior, Mid | Senior — the row exists but no role offers it and its content does not exist |
| Interview types | Behavioural (STAR), technical concepts, QA scenario and test design | Coding (Monaco + Judge0), system design (phase 2) |
| Modes | Text (M3), then voice (M5) | Avatar interviewer (phase 3) |
| Platforms | Responsive web, installable as a PWA | React Native / Expo (phase 2) |
| Markets | Nigeria in Naira via Paystack; international in USD via Stripe | GBP and EUR later |

## 4. Architecture

*Three services, one database, and a hard rule about who may talk to what.*

Readi is a Turborepo monorepo with pnpm workspaces holding three applications and four shared packages. Two architectural rules shape everything else. **Only the API touches the database** — the AI worker has no connection string and no Prisma client. And **every external AI call is made by the worker** — the API asks the worker, never a provider directly. Both are recorded as architecture decisions and both are enforced by the code’s structure rather than by convention.

![Figure 1 — System architecture. Solid boxes are built and tested today; dashed boxes are planned.](diagrams/figure-01-system-architecture.svg)

*Figure 1 — System architecture. Solid boxes are built and tested today; dashed boxes are planned.*

### 4.1 The three applications

| Application | Technology | Responsibility | State |
| --- | --- | --- | --- |
| apps/web | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Serwist | Candidate app, marketing pages and the staff CMS under /admin. Pages resolve the user on the server; the browser calls the API same-origin so cookies stay first-party. | Built |
| apps/api | NestJS 11, Prisma 7, PostgreSQL 16 + pgvector, Redis, BullMQ | The only service with database access. Authentication, profiles, consent, CV, content, catalogue, privacy, admin. Routes are default-deny. | Built |
| apps/ai-worker | Python 3.12, FastAPI, Pydantic v2, uv | Every external AI call. Today: CV parsing and embeddings. From M3: the interview engine. No database access. | Part built |

### 4.2 The shared packages

| Package | What it holds |
| --- | --- |
| packages/shared-types | Zod schemas — the single source of truth for every cross-service shape, in eleven contract modules, plus a Zod-free constants file the browser can import. |
| packages/api-client | A typed client generated from the API’s OpenAPI document, over openapi-fetch (about 6 KB in the browser), with helpers that turn stable error codes into something the UI can translate. |
| packages/ui | Design tokens as CSS custom properties, and the contrast test that gates them. Deliberately no React components — the shared chrome lives in the web app. |
| packages/config | Shared ESLint, Prettier, Vitest and TypeScript configuration for every workspace. |

### 4.3 Contracts and code generation

A shape that crosses a service boundary is written once, in Zod, and everything else is generated and committed. Two chains run from the same source, and a single command regenerates both and fails on any difference.

![Figure 2 — One source of truth for every contract. Both chains are checked for drift by CI.](diagrams/figure-02-contract-pipeline.svg)

*Figure 2 — One source of truth for every contract. Both chains are checked for drift by CI.*

The practical effect: a developer cannot change a field in TypeScript without the Python worker and the web client following in the same commit, and a reviewer sees the full consequence of a contract change in the diff.

### 4.4 Local infrastructure

One Docker Compose file provides everything needed to run the whole system offline. Every port is bound to localhost only and deliberately avoids the usual defaults, so another project on the same machine keeps working.

| Service | Image (pinned) | Host port | Purpose |
| --- | --- | --- | --- |
| postgres | pgvector/pgvector:0.8.6-pg16 | 15432 | PostgreSQL 16 with the pgvector extension |
| redis | redis:8.8.2-alpine | 16379 | Cache, BullMQ queues, rate limits, engine state |
| s3 | chrislusf/seaweedfs:4.44 | 19000 | S3-compatible storage, standing in for Cloudflare R2 |
| s3-init | chrislusf/seaweedfs:4.44 | — | One-shot job that creates the development bucket |
| livekit | livekit/livekit-server:v1.13.7 | 7880/7881/7882 | Real-time media in dev mode — no consumer until M5 |

Application ports: web 3002, API 4000, AI worker 8000. The end-to-end suite uses its own ports (3010/4010/8010), its own database and its own build folders, so it can run while a development server is up.

### 4.5 Decisions of record

Fifteen architecture decision records are accepted. They are the reason the codebase is consistent, and they are binding: an accepted record is never edited, only superseded.

| # | Decision |
| --- | --- |
| 0001 | Monorepo layout, pinned stack versions, and local infrastructure (including SeaweedFS in place of the unmaintained MinIO community edition) |
| 0002 | Vitest as the single TypeScript test runner, including for NestJS |
| 0003 | Zod is the source of truth for shared contracts; Pydantic models are generated from it |
| 0004 | The AI worker has no direct database access |
| 0005 | Better Auth, hosted inside the NestJS API, behind our own AuthService interface |
| 0006 | Voyage AI for embeddings, 1024 dimensions, stored in pgvector with the model that made them |
| 0007 | AI cost recorded as integer micro-USD in a separate ai_call_log table |
| 0008 | Langfuse is treated as a personal-data store — EU region, under a data-processing agreement |
| 0009 | Auth integration: same-origin cookies, and a trusted client-IP header supplied by the hosting edge |
| 0010 | LLM adapter and CV parsing: the browser uploads to storage; extraction happens in the worker |
| 0011 | Data export and account deletion: soft delete, a grace period, and tombstoned records |
| 0012 | Web client: a generated API client, server-resolved sessions, and forms without Zod in the browser |
| 0013 | Visual identity: the Margin direction, its tokens, fonts and chart rules |
| 0014 | Learning content: statuses, version history, the answer key, the source of truth after import, and expert review before production |
| 0015 | Roles, levels and stacks are content, and a question can be written for a stack |

One more is expected in the next milestone: **ADR-0016**, recording how interview events travel between the worker and the API.

## 5. What is implemented today

*Five milestones, five merged pull requests, and a content branch in flight.*

![Figure 3 — Delivery map. Five milestones are merged; the content programme is on a branch; everything from the interview engine onward is planned but not started.](diagrams/figure-03-delivery-map.svg)

*Figure 3 — Delivery map. Five milestones are merged; the content programme is on a branch; everything from the interview engine onward is planned but not started.*

### 5.1 What a candidate can do today

A candidate can find the landing page, create an account with an email address, a Nigerian phone number or a Google account, complete a career profile, upload a CV and have it parsed into structured skills, projects and experience, record their consent choices, review and correct everything, download everything the system holds about them, and delete their account. That is the whole of the candidate experience today.

![Figure 4 — The candidate journey. Orange is live; grey dashed is planned.](diagrams/figure-04-candidate-journey.svg)

*Figure 4 — The candidate journey. Orange is live; grey dashed is planned.*

The `/home` screen already carries the card for the diagnostic interview — with its button deliberately disabled and a comment in the source saying it arrives in M3.

### 5.2 The API

NestJS, nineteen modules, 59 routes. Every route requires a session unless it is explicitly marked public, and exactly **three** routes in the whole API are public: the health check, the authentication router, and a development-only mailbox that cannot exist in production.

#### Modules that exist

| Module | What it does |
| --- | --- |
| auth | Better Auth hosted inside the API, plus the global default-deny guard. Email and password, Google, Nigerian phone OTP, password reset, email verification. Three dangerous plugin routes are hard-disabled. |
| users | The signed-in user, and the onboarding state machine. |
| profiles | The career profile: role, level, stack variant, years, technologies, company type, target date. |
| consents | Versioned, append-only consent decisions — one row per change, carrying the version of the text shown. |
| cv | Presigned browser upload into a quarantine prefix, file-signature check on confirm, a queued parse job, candidate corrections, deletion. |
| content | The largest module: the CMS for questions, rubrics, lessons, tracks, modules, topics, roles, levels and stacks; the workflow rules; keyset-paged lists; the candidate-facing read endpoints; the seed importer; question embeddings. |
| account | Data export, deletion request, erasure, and the hourly sweep that carries it out. |
| admin | One route today: user counts by role. |
| health | Database and Redis probes with a timeout, returning 200 or 503. |
| storage | S3 presigning, bucket CORS, and the lifecycle rule that expires unconfirmed uploads. |
| ai-worker | The typed HTTP client for the Python worker. Two operations exist: parse a CV, and embed text. |
| ai-calls | Persists the AI-call records the worker reports, with cost in integer micro-USD. |
| audit | The append-only audit log, written inside the same transaction as the change it describes. |
| notifications | Chooses the email and SMS backends from configuration — Resend and Termii if configured, otherwise console providers feeding a development mailbox. |

#### Routes, by group

| Group | Routes | Access |
| --- | --- | --- |
| Authentication (Better Auth router) | sign-up, sign-in, password reset, email verification, Google, phone OTP | Public by construction |
| GET /api/auth-methods | 1 | Public |
| GET /health | 1 | Public |
| GET /api/dev/mailbox | 1 | Public — and the controller does not exist in production |
| /api/me — user and onboarding | 2 | Session |
| /api/me/profile | 2 | Session |
| /api/me/consents | 2 | Session |
| /api/me/cv | 5 | Session |
| /api/me/export and /api/me/deletion | 2 | Session, plus a typed confirmation and a recent sign-in for deletion |
| /api/content — candidate reads | 4 | Session; answer-key fields cannot appear in any response |
| /api/admin/stats | 1 | Role: admin |
| /api/admin/content — the CMS | 38 | Role: content_expert or admin, with finer rules inside the service |

The full route list is in Appendix A. The OpenAPI document is generated from the same Zod schemas the routes validate with, served at `/docs` outside production, and exported without needing a database.

#### Background work and command-line tools

| Name | What it does |
| --- | --- |
| cv-parse queue | A BullMQ queue carrying ids only. Transport failures retry with backoff; after the last attempt the CV is marked failed. |
| account-erasure sweep | An hourly scheduled job — idempotent across instances — that erases every account whose grace period has expired and purges expired verification records. |
| admin:grant | Grants a role to an existing user. Audited, and it refuses to run in production unless explicitly acknowledged. |
| admin:cancel-deletion | Cancels a scheduled deletion during the grace period. Audited. |
| db:seed | Imports /content/seed. Idempotent, with a dry run and a force mode. Never deletes, publishes or embeds. |
| content:reembed | Re-embeds published questions whose vector is missing or was made by a different model. |
| content:review-doc | Generates the reviewer-facing Markdown pages from the seed files. |
| storage:setup | Creates the bucket, applies CORS for browser uploads, and sets the upload-expiry rule. |

#### Third-party integrations, as they stand

| Integration | State |
| --- | --- |
| Better Auth (+ Google, phone OTP) | Real and fully wired, behind our own interface. Rate limits stored in Redis. Sessions refused for accounts pending deletion. |
| Resend (email) | A real implementation, selected only when configured; otherwise a console provider. Every send goes through one sender that refuses placeholder addresses. |
| Termii (SMS) | A real implementation with per-number OTP caps, selected only when the key, sender ID and base URL are all present. |
| S3 / Cloudflare R2 / SeaweedFS | Real. Presigned uploads with type and length signed, a quarantine prefix, CORS and expiry rules. |
| Sentry | Real and privacy-hardened: no request bodies, no stack-frame locals, an event scrubber, and tests that prove it. A no-op until a DSN is set. |
| Anthropic (via the worker) | Real, used for CV parsing today. Structured output with a JSON schema; refusals are never retried as if they were formatting errors. |
| Voyage AI (via the worker) | Real, but off by default — a deterministic fake stands in, so duplicate detection currently matches only identical text. |
| Langfuse | Not implemented anywhere. Only the trace-id column exists, waiting for M3. |
| PostHog | Configured in the web app and disabled without a key. No events are defined yet. |
| Paystack, Stripe, LiveKit, Deepgram, text-to-speech | Absent. No code, no dependency, no configuration. |

### 5.3 The database

Twenty-eight tables, twelve migrations, all owned by Prisma except a small set of hand-written objects that Prisma cannot see.

![Figure 5 — The data model today, and the tables the next milestones add.](diagrams/figure-05-data-model.svg)

*Figure 5 — The data model today, and the tables the next milestones add.*

> **Two hazards the team has already met, and written down**
>
> **Prisma keeps proposing to drop the vector index.** Because `questions.embedding` is a type Prisma does not model, it has proposed dropping the hand-written HNSW index in four separate migrations that never touched the questions table. Each one was deleted by hand. Losing it breaks nothing visibly — duplicate search just becomes a full scan — and only one test notices.
>
> **One migration cannot be replayed onto a database with existing rows.** The migration that moved roles and levels onto the catalogue aborts against a database that has profiles and tracks but no catalogue, and Prisma then records a failed migration that blocks every later deployment. It must not be fixed by editing the applied migration. Whoever deploys first owns this — it is the single most likely first-deployment failure.

### 5.4 The web application

Forty-two page routes across five areas, six layouts and fifty-one components. Every page is a server component that resolves the user before rendering; the browser calls the API same-origin through a rewrite, so authentication cookies stay first-party.

| Group | Routes | Access |
| --- | --- | --- |
| Marketing and public | /, /status, /~offline, the manifest and the service worker | Public — /status becomes admin-only in production |
| Authentication | /login, /signup, /phone, /forgot-password, /reset-password, /account-deleted | Public, redirecting anyone already signed in |
| Onboarding | /onboarding/profile, /onboarding/cv, /onboarding/consent | Requires a user; each step redirects to the one still owed |
| Candidate app | /home, /profile and four sub-pages including data and account | Requires a completed onboarding |
| Admin and CMS | /admin and twenty-two CMS routes across eight content sections | Requires the admin or content-expert role — and returns 404, not 403, so staff routes are not advertised |

#### The design system

The visual identity is called **Margin**: a reading column with a margin for the mentor’s notes, a structural grey carrying navigation and frames, and orange used only as the mentor’s pen — actions, marks and progress, never decoration that carries meaning.

- Tokens live in one CSS file and are the single source for a contrast test that checks **27 colour pairs in both light and dark themes** — every text pair at 4.5:1, every meaningful graphic at 3:1. A colour cannot drift from its own check.
- Three self-hosted typefaces are trimmed to **55.8 KB**, under a 60 KB budget that a test enforces. The naira sign has its own tiny face, fetched only on a page that shows ₦.
- Charts, when they arrive, are plain server-rendered SVG — a charting library was considered and rejected. Every chart must carry a keyboard readout and a “see the numbers” table.
- At most one orchestrated animation per page, switched off under reduced-motion preferences.
- The PWA service worker and offline fallback are real and working. It precaches only the offline page deliberately, so installing it does not pull every script over metered data. Installable icons are M10 work.

### 5.5 The AI worker

A small, hardened Python service with three routes — a health check, CV parsing and embeddings — behind a constant-time service-token check applied at the router level, so every future route inherits it. Request bodies over 8 MiB are rejected whether or not a length is declared.

| Interface | Status |
| --- | --- |
| LLMClient | Built. Anthropic implementation using structured output with a JSON schema, plus a deterministic fake and a scripted client for tests. Invalid output is retried twice; a refusal is not. Provider errors surface as a type name only, never a message that could echo a CV. |
| EmbeddingProvider | Built. Voyage AI over plain HTTP with its own retries, results sorted by index rather than arrival, and a vector of the wrong length refused rather than stored. Fake by default. |
| SpeechToText | Not written — M5. |
| TextToSpeech | Not written — M5. |
| AvatarProvider | Not written — phase 3. |

Prompts live in versioned files and a released version is never edited in place. Two exist today, both at version 2, for CV parsing. Candidate text is always wrapped in delimited tags, and any copy of those tags inside the text is neutralised so it cannot close the block and pose as instructions — with tests that prove it.

### 5.6 Content, the CMS, and the question banks

Roles, levels, stacks, tracks, modules, lessons, rubrics and questions are all content. They share one workflow, one version-history table and one audit trail — which is why adding a new role is a content task rather than a migration, and why that claim was proved end to end by adding a fourth role through the CMS with no change to the application code.

![Figure 6 — How content is created, reviewed and published. Built and in use today.](diagrams/figure-06-content-workflow.svg)

*Figure 6 — How content is created, reviewed and published. Built and in use today.*

The banks themselves were written from blueprints — a stated set of levels, variants, core topics and target counts, with a floor of two questions per core topic at each level — and put through four critique passes and a rubric stress test.

![Figure 7 — The question banks: what exists, and what is still owed.](diagrams/figure-07-question-bank-status.svg)

*Figure 7 — The question banks: what exists, and what is still owed.*

> **The honest state of the content**
>
> All 104 questions are marked as a model’s draft. **No human expert has reviewed any of them.** The system is built to refuse publishing them in production without an explicit, audited acknowledgement — but that is a safety net, not a substitute for the review.
>
> The 510 sample answers in the repository are model-written and model-scored. They are a rubric stress test and a regression baseline, deliberately **not** the human-scored gold set that the evaluator’s agreement metric will need at M4.
>
> Sixteen of ninety-four blueprint targets are unmet, and seven shortfalls were accepted rather than padded with weak questions. The offline checker reports them on every run.

### 5.7 Privacy and data protection

The Nigeria Data Protection Act 2023 and GDPR readiness were designed for from the first milestone, not retrofitted.

![Figure 8 — Consent, export and deletion. Built and covered by tests since M1.](diagrams/figure-08-privacy-lifecycle.svg)

*Figure 8 — Consent, export and deletion. Built and covered by tests since M1.*

### 5.8 Testing and continuous integration

| Layer | What is covered |
| --- | --- |
| API unit tests | Environment validation, the seed loader, the workflow rules, keyset cursors, question eligibility, log scrubbing, the production guard. |
| API integration tests | Every endpoint against a real database and Redis — including a test that reads the route list out of the OpenAPI document and checks the raw JSON of every candidate route for answer-key fields, and a schema test that is the only thing that notices if the vector index disappears. |
| Web unit tests | Pure logic only: open-redirect handling, error-code mapping, forged-header rejection, the typed deletion confirmation, the font budget, time-zone-stable dates. There are deliberately no component-rendering tests yet — that is M10. |
| Python tests | Settings validation, CV extraction including a refused zip bomb, prompt-injection cases, retry and refusal behaviour, embedding ordering and length, Sentry privacy configuration. |
| End-to-end | Six Playwright specs, all at a 360-pixel phone viewport, against built applications on their own ports, database and bucket, with fake AI providers so a run costs nothing. They prove the milestone acceptance criteria: sign-up through onboarding; export then delete; an expert writes and an admin publishes before a candidate can see it; a role added entirely through the CMS. |
| On demand | A Slow-4G page-weight report, and a capture of 80 screenshots across 34 screens, two widths and two themes for before-and-after review. |
| CI | GitHub Actions: TypeScript lint, typecheck and tests; Python lint, types and tests; a contract-drift job; and an end-to-end job. **No repository secrets are needed** — CI reaches no third party. |

## 6. What is outstanding

*Seven engineering milestones, a phase-2 programme, a content programme, and a short list of decisions only the owner can make.*

### 6.1 M3 — the interview engine, in text mode

This is the next milestone and the centre of the product. It builds the deterministic interview and the fifteen-minute diagnostic, stopping deliberately short of scoring — but it must leave M4 a session that can be scored **reproducibly**.

![Figure 9 — The interview state machine, and the division of labour between our code and the model.](diagrams/figure-09-interview-state-machine.svg)

*Figure 9 — The interview state machine, and the division of labour between our code and the model.*

#### Four decisions already taken

| Decision | Choice |
| --- | --- |
| How turns reach the browser | Server-sent events, whole-turn frames. Token-by-token streaming waits for the voice milestone. |
| What happens when a session ends | A real processing screen that polls, above the full transcript. |
| Session lengths at launch | Fifteen and thirty minutes only. Forty-five minutes waits for a bigger question bank. |
| The interviewer model | claude-sonnet-5, at an estimated two to four US cents per thirty-minute text interview. |

#### The six phases

1. **Contracts, schema, sessions and selection** — the database models and one migration, the create/list/get endpoints, the bundle of pinned content sent to the worker, seeded and therefore reproducible question selection, rate limits, a stale-session sweep. No language model involved at all.
2. **The engine in the worker** — a pure state machine with an exhaustive transition table, the budgets, five versioned prompts, the Redis state store, an interview-aware fake model, and prompt-injection tests.
3. **Wiring** — the worker client call, the server-sent-event route and frame contract, idempotent turn persistence, AI-call records carrying the session id, resume after a cache miss, ending early, and the architecture decision record for how events travel.
4. **The web** — the practice list and session setup, the interview screen itself, the end-interview confirmation, the processing screen, the diagnostic entry point, and the phone tab bar deferred from the design milestone.
5. **Langfuse** — worker-side tracing with a masking hook, the trace id into the call log, retention, and erasure reaching Langfuse. Ships correct-but-disabled if the keys have not arrived.
6. **Verification and documentation** — an end-to-end interview spec, screenshots, a Slow-4G pass, and the handover.

**Version pinning is the part worth understanding.** A session records the exact version of five things — the question, its rubric, the role, the level and the stack — and stores a snapshot of the content actually used. The test for it edits published content after a session and asserts that the session does not move. Without this, a report could silently change months later.

### 6.2 M4 and M6 — evaluation, reports and the readiness score

![Figure 10 — From a finished interview to a readiness score, with the guardrails that make the score defensible.](diagrams/figure-10-evaluation-to-readiness.svg)

*Figure 10 — From a finished interview to a readiness score, with the guardrails that make the score defensible.*

M4 adds per-answer evaluation, the assembled session report, the regression harness in `/evals`, and a calibration tool where experts blind-score sampled answers so that agreement between the model and humans can be measured. M6 adds delivery metrics from the timestamped transcript — words per minute, filler rate, long pauses, a rambling flag — and the readiness score itself.

> **The readiness formula is not finished, and finishing it is the owner’s call**
>
> The shape is fixed: technical 40%, behavioural 25%, communication 20%, topic coverage 15%, with bands at 40, 60 and 75 and a floor of three completed sessions before anyone may be called “Ready”.
>
> Deliberately unresolved: how weights normalise with fewer than five sessions, what happens to a component with no data, the decay slope outside the words-per-minute band, the size of the pause and rambling penalties, how mixed voice and text users are handled, and whether the diagnostic counts toward the three-session minimum.
>
> These are to be proposed as explicit values at M6 and **require product sign-off before version 1 is final**. A second question is already recorded: the technical/behavioural/communication split assumes an engineering interview, and should be re-examined before the first non-engineering role launches.

### 6.3 M5 — voice mode

![Figure 11 — Voice mode and its latency budget. None of this is written yet.](diagrams/figure-11-voice-mode-latency.svg)

*Figure 11 — Voice mode and its latency budget. None of this is written yet.*

### 6.4 M7 to M10, and phase 2

| Milestone | Scope | Notable constraints |
| --- | --- | --- |
| M7 — Study plan and lessons | A rules-based plan generator as a pure function; dated plan items weighted toward weak topics with a weekly mock; the candidate-facing lesson reader ending in a practice question; offline lesson caching; email reminders. | The model writes only the friendly weekly summary — never the schedule. |
| M8 — Billing | Plans, prices, subscriptions, entitlements, a usage ledger, payments and webhook events; Paystack and Stripe with country routing; Naira weekly and monthly, USD monthly and annual; voice-minute top-ups; paywall; one-click cancel; renewal reminders. | Access is controlled only by the entitlements table, updated only by signature-verified, idempotent webhooks or audited admin action. Money is stored as integers in minor units. Prices are configured by an admin, never hardcoded. |
| M9 — Feedback, analytics, operations | Post-session ratings, question flags and the admin review queue; nineteen analytics events behind a typed helper with a no-PII test; admin operations including a cost dashboard with an alert threshold; scheduled retention jobs. | The flag table already exists in the schema with no code behind it — schema ahead of code, deliberately. |
| M10 — Hardening and launch | A security review with a test that enumerates every route and asserts its guard; a prompt-injection suite across all three model uses; timeouts and circuit breakers; a privacy verification end to end; performance and load testing; PWA installability; an accessibility pass; runbooks; production Dockerfiles and deployment configuration. | There are no production Dockerfiles today, and no deployment configuration of any kind. |
| Phase 2 | The Expo mobile app; coding interviews (Monaco and Judge0) and system design (Excalidraw and a vision model); opt-in on-device camera coaching; organisations, cohorts and seats. | Camera coaching runs entirely in the browser; only numbers are ever sent. |

### 6.5 The content programme

Separate from the engineering milestones, and currently the work in flight:

- **138 follow-up probes to retrofit** — 70 for frontend and 68 for backend, to the shape the QA pilot settled. Without them the interview engine has nothing to probe with on two of the four launch roles.
- **A full-stack pass** — the only launch role with no bank of its own. Its 62 questions are all borrowed through role tags, and two of its topics are not even in the topic list yet.
- **Five of eight role-and-level combinations have no track at all** — a candidate choosing them gets “no track found”. That is lessons work, and it belongs to M7.
- **Wave-two banks** — AI/LLM engineer, then DevOps/Cloud, then Mobile. Blueprints are written for twelve roles; the data-analyst bank is blocked on there being a SQL practice surface at all.
- **Human expert review of all 104 questions** — not on the engineering plan, and a real cost and lead time.
- **A re-check cycle for version-sensitive claims** — twenty-three marked claims across three banks, and three of eight QA claims had already moved after a single day. Marking them makes them findable; it does not make them checked.

### 6.6 Technical debt already recorded

These are known, written down, and deliberately deferred — not discoveries.

| Item | Where it bites |
| --- | --- |
| The catalogue migration cannot be replayed onto a populated database | The first real deployment. Must not be fixed by editing the applied migration. |
| The whole message catalogue ships to the browser — about 14 KB, twice on the landing page | Page weight on a metered connection. Three fix options are costed; M10. |
| Rate-limit keys in Redis contain raw phone numbers and email addresses | A privacy edge; M10. |
| No per-account sign-in throttle (only per-IP) | Credential stuffing from many addresses; M10. |
| The development mailbox is gated only on the environment variable | Would expose verification links if that variable were ever wrong; M10. |
| No component tests in the web app | Three named pieces of logic are the riskiest untested code; M10. |
| Retiring a rubric silently hides every published question using it | A content-workflow gap, recorded rather than fixed. |
| No path to migrate candidates when a level or stack is withdrawn | The refusal to retire is, in the team’s own words, “a stop sign with no detour”. |
| Two missing database indexes, and a question edited while retired keeps a stale vector | Minor; recorded. |
| Google sign-in has never been exercised against real credentials | It is wired and configuration-gated, but unproven. |
| Support email addresses are still placeholders | Both the API and the web build refuse placeholders in production — so this blocks a deployment until fixed. |
| Small accessibility items from the first review | No skip link; radio groups lack an invalid state; some fields share an accessible name. |

### 6.7 Decisions only the owner can make

1. **Should coding interviews move earlier?** They are tagged phase 2, yet they are the round candidates most often fail for three of the four launch roles — and the role catalogue rates those roles “most” rather than “full” coverage precisely because of it. Re-ordering is far cheaper before M3 is planned than after M4 assumes every answer is prose.
2. **What happens to a candidate whose technology variant is not offered?** Today “not sure yet” quietly means general questions only, with no explanation. Decide whether “other” is a third state with a free-text note, or simply better wording.
3. **The readiness formula constants**, as set out in section 6.2 — and whether the technical/behavioural/communication split survives the first non-engineering role.
4. **What the “any questions for me?” segment is scored against**, and where salary negotiation lives — it has no home, because tracks are keyed by role and level.
5. **When the senior level is published.** The row exists, no role offers it, and the interview behind it does not: it needs system design as a question type, rubric dimensions for scope and influence, longer sessions and a readiness answer.
6. **Whether an email address collected at checkout must be verified before use.** Open since the kickoff; it bites at M8.
7. **Who reviews the question banks, and when.** This is the long pole that no engineering milestone covers.

## 7. What you need to provide, and when

*Nothing external is blocking the build. The list that matters is the one that gates a public deployment.*

The default configuration reaches no paid service at all: a fake language model, fake embeddings, console email and SMS feeding a development mailbox, and local containers for the database, cache, object storage and media server. Continuous integration uses no repository secrets. That is deliberate — it means development and testing cost nothing and touch no third party.

![Figure 12 — Dependencies sorted by when they are needed, not by vendor.](diagrams/figure-12-dependencies-by-milestone.svg)

*Figure 12 — Dependencies sorted by when they are needed, not by vendor.*

### 7.1 Already held, or generated locally

| Item | What to do |
| --- | --- |
| Anthropic API key | Already in the worker’s environment file from milestone M1. Used for CV parsing today and the interviewer from M3. |
| Three local secrets | Generate each with `openssl rand -base64 48`: the authentication secret; a proxy secret shared between the web app and the API; and a service token that must be identical in both the API and the worker. |
| Docker services | One command brings up Postgres with pgvector, Redis, S3-compatible storage and a LiveKit development server. |

### 7.2 Needed to finish milestone M3

| Item | What to do | Why |
| --- | --- | --- |
| A Langfuse Cloud project in the EU region | Create the project; supply the public key, the secret key and the host. Sign the data-processing agreement, restrict access to named staff with two-factor authentication, and set the project’s retention. | Tracing for every model call. Langfuse holds personal data and is treated as such. Phase five of M3 ships correct-but-disabled without the keys — but then the retention and bulk-deletion verification slips to M5. |
| Approval to spend on a real run | A word before the first end-to-end run against the real model. | Estimated at two to four US cents per thirty-minute text interview — an engineer’s estimate, not an invoice. |
| Ten minutes of review | Look at the interview screen at 360 pixels after phase four. | It is the screen a candidate spends the whole session on. |

### 7.3 Needed before anything is public

This is the real list. Several of these are approvals rather than sign-ups, and they have lead times that are outside anyone’s control.

| Item | What it involves |
| --- | --- |
| A domain name | Used by the application, as the email sending domain, and in every OAuth callback. Nothing in the repository names one. |
| Resend, with a verified sending domain | Sign up, add the DNS records that verify the domain, create an API key, and set a real “from” address. The API refuses to start in production on any other email provider. |
| Termii: API key, account base URL, and an approved sender ID | **The sender ID must be approved by Termii for the DND route.** That is an approval process, not a form, and it is the classic long pole for Nigerian SMS. The API refuses to start in production on any other SMS provider. |
| A real support mailbox | Both the API and the web build refuse placeholder addresses in production, and the address appears in deletion messages. |
| Cloudflare R2 | An account, a bucket, an S3 API token — and then the CORS rule for browser uploads and the one-day expiry rule for unconfirmed uploads must exist on the production bucket. |
| A hosting decision | Three services to run (web, API, worker), managed PostgreSQL 16 **with pgvector**, managed Redis, and a region for each. The choice must include an edge that sets a trustworthy single-value client-IP header — without it the authentication rate limits do not work at all. |
| A Voyage AI key | Production refuses the fake embedding provider. Follow the switchover runbook and re-embed the published questions afterwards. |
| Sentry projects and a production Google OAuth client | Three Sentry projects (web, API, worker) for their DSNs; the production redirect URI added to the Google client. |
| Privacy policy, terms of service, refund policy | None exists. The landing page currently has nothing to link to, and this is recorded on the pre-public checklist. |

### 7.4 Needed at later milestones

| Milestone | Item | Note |
| --- | --- | --- |
| M5 | LiveKit Cloud | Region choice matters for Nigerian latency. Billed per participant minute. |
| M5 | Deepgram (or an alternative) | Must be benchmarked on Nigerian-accented speech **before** it is chosen — word error rate overall and on technical terms. |
| M5 | ElevenLabs or Cartesia | Text to speech, billed per character or per second. |
| M5 | Consented Nigerian-accented audio samples | A data-collection task with its own lead time, not a configuration step. |
| M8 | Paystack | Nigerian business verification — company documents and a settlement bank account — before live keys. Test mode first. |
| M8 | Stripe | Account and business verification. USD only at launch. |
| M9 | PostHog | Already wired and disabled; the European cloud is the configured default. |
| Phase 2 | Meta WhatsApp Cloud API | Business verification and message-template approval. |
| Phase 2 | Apple and Google developer accounts | For the Expo app and store review. |

### 7.5 How costs arise

No prices are set in the repository, and plan prices are deliberately not in the code — they are configured by an admin. What follows is how cost is incurred and tracked, not what it will be.

| Billed per use | Unit | Flat or subscription |
| --- | --- | --- |
| Anthropic — interviewer, evaluator, CV parsing | Input and output tokens | Langfuse Cloud |
| Voyage AI — embeddings | Input tokens | Sentry |
| Deepgram — speech to text | Audio minutes | PostHog |
| ElevenLabs or Cartesia — speech | Characters or seconds | Hosting, managed Postgres, managed Redis |
| LiveKit — real-time media | Participant minutes | The domain name |
| Termii — SMS | Per message | Apple and Google developer accounts (phase 2) |
| Resend — email | Per message above a free tier |  |
| Cloudflare R2 — storage | Storage and operations |  |
| Paystack and Stripe | A percentage of each transaction |  |

Every model call already records provider, model, purpose, latency, usage and estimated cost in **integer micro-USD** — cents would round to zero. A separate ledger will meter voice and avatar minutes against a customer’s allowance; it is never used for cost. From M9 there is a cost dashboard with a configurable alert threshold on the average cost of a voice session.

> **One cost figure in the code is explicitly unverified**
>
> The embedding price for Voyage is marked in the source as an estimate set before anyone had a key, with a note to confirm it against the vendor’s own pricing page on the first real call. It should be checked before any cost figure is shown to anyone.

### 7.6 Local prerequisites

| Tool | Requirement |
| --- | --- |
| Node | Exactly 24.x |
| pnpm | Exactly 12.x, enabled through corepack |
| uv | Any version — it manages the Python toolchain |
| Python | 3.12, found through uv |
| Docker | Engine running, with the Compose v2 plugin |
| Git | Any version |
| Repository location | On the Linux filesystem, not under a Windows mount — the checker warns about this |

`pnpm prereqs` checks every one of these and names whichever is missing.

### 7.7 Environment variables

#### apps/api

| Variable | Purpose | Default |
| --- | --- | --- |
| NODE_ENV | Runtime mode; production turns on a block of extra requirements | development |
| HOST / PORT | Bind address and port | 127.0.0.1 / 4000 |
| DATABASE_URL | PostgreSQL with pgvector | points at the local container |
| DATABASE_POOL_MAX | Connections this process may hold | 10 |
| REDIS_URL | Cache and queues | points at the local container |
| HEALTH_CHECK_TIMEOUT_MS | Health probe timeout | 2000 |
| SENTRY_DSN | Error reporting; empty disables it | empty |
| PUBLIC_WEB_URL | The web origin the auth system trusts | http://localhost:3002 — must be https in production |
| BETTER_AUTH_SECRET | Session signing secret, at least 32 characters | **required — generate it** |
| GOOGLE_CLIENT_ID / _SECRET | Google sign-in; empty hides the button. One without the other is refused | empty |
| AUTH_RATE_LIMIT_ENABLED | Per-IP limits on authentication routes | true |
| WEB_PROXY_SECRET | Shared with the web app so the forwarded client IP can be trusted | **required in production** |
| OTP_MAX_PER_NUMBER_PER_HOUR / _DAY | Phone OTP throttles | 5 / 10 |
| SUPPORT_EMAIL | Shown in deletion messages | a placeholder — a real address is required in production |
| EMAIL_PROVIDER / EMAIL_FROM | console or resend; the From header | console — must be resend in production |
| RESEND_API_KEY | Required when the provider is Resend | empty |
| SMS_PROVIDER | console or termii | console — must be termii in production |
| TERMII_API_KEY / _SENDER_ID / _BASE_URL | The key, the DND-approved sender ID, and the account base URL | empty |
| S3_ENDPOINT / _REGION / _BUCKET | Object storage location | the local container; https required in production |
| S3_ACCESS_KEY_ID / _SECRET_ACCESS_KEY | Storage credentials | development values — explicitly refused in production |
| S3_FORCE_PATH_STYLE | Path-style addressing, needed locally | true |
| AI_WORKER_URL / _TOKEN / _TIMEOUT_MS | Where the worker is, the shared service token, and the timeout | local worker; **token required**; 150 s |
| CONTENT_DUPLICATE_THRESHOLD | Similarity at which a near-duplicate question is warned about | 0.92 |
| JOBS_ENABLED / QUEUE_PREFIX | Whether this process runs the queue worker, and its key namespace | true / readi |

> **What the API refuses to do in production**
>
> It will not start unless: the email provider is Resend, the SMS provider is Termii, the proxy secret is set, the support address is real, the web URL and the storage endpoint are https, and the storage credentials are not the development ones.
>
> That is a deliberate design: a misconfigured production deployment fails loudly at boot rather than quietly sending nothing.

#### apps/web

| Variable | Purpose | Default |
| --- | --- | --- |
| API_INTERNAL_URL | Server-side URL of the API | the local API |
| SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN | Server and browser error reporting; empty disables | empty |
| NEXT_PUBLIC_POSTHOG_KEY / _HOST | Analytics; empty disables | empty / the EU cloud |
| NEXT_PUBLIC_SUPPORT_EMAIL | Shown on deletion screens | empty — required at build time in production |
| APP_ENV | Deployment environment (NODE_ENV is unusable — a build always sets it to production) | development |
| WEB_PROXY_SECRET | The same value as the API’s | required in production |
| CLIENT_IP_HEADER | The header the hosting edge sets to the client IP | empty — **required in production** |

#### apps/ai-worker

| Variable | Purpose | Default |
| --- | --- | --- |
| ENVIRONMENT | development, test or production | development |
| HOST / PORT / LOG_LEVEL | Bind address, port, verbosity | 127.0.0.1 / 8000 / info |
| REDIS_URL | Ephemeral engine state from M3 | the local container |
| SENTRY_DSN | Error reporting; empty disables | empty |
| SERVICE_TOKEN | Must equal the API’s worker token, at least 32 characters | **required** |
| LLM_PROVIDER / ANTHROPIC_API_KEY | anthropic or fake; the key | anthropic — fake is refused in production |
| LLM_MODEL_CV_PARSE / LLM_TIMEOUT_S | Model for CV parsing, and its timeout | claude-sonnet-5 / 90 s |
| EMBEDDING_PROVIDER / VOYAGE_API_KEY | voyage or fake; the key | fake — refused in production |
| EMBEDDING_MODEL / _DIMENSIONS / _TIMEOUT_S | Model, vector length, timeout | voyage-4 / 1024 / 30 s |

A fourth file, `infra/.env.example`, exists only to move host ports if one clashes with something else on the machine. Milestone M3 will add the interviewer model and the Langfuse keys; no variable for LiveKit, speech, payments or Langfuse exists anywhere yet.

### 7.8 Hosting — the decision that has not been made

No host is named anywhere in the repository, and the team has been explicit about that rather than vague. The subprocessor register lists “the application host and managed Postgres/Redis” with its processing region recorded as “to be decided before launch”. Milestone M10 defers deployment configuration to “the chosen hosts”. There are no production Dockerfiles.

Three connected decisions are owed: **where the three services run**, **managed PostgreSQL 16 with the pgvector extension and managed Redis**, and **the region for each** — which then has to be written into the subprocessor register, because that register is what a data-protection review reads.

One hard constraint applies whatever is chosen: the hosting edge must set a trustworthy single-value client-IP header. The authentication rate limits depend on it, and both the header name and the shared proxy secret are required in production.

## 8. Risks, and where to spend attention

| Risk | Why it matters | What would reduce it |
| --- | --- | --- |
| No human has reviewed any question or rubric | The product’s whole claim is fair, specific feedback. 104 model-written questions and 102 model-written rubrics stand between that claim and a candidate. | Commission expert review now, in parallel with M3 — it has a lead time no milestone covers, and the reviewer-facing pages are already generated for it. |
| The first deployment will hit a migration that cannot replay | A failed migration row blocks every later deployment, and the tempting fix — editing the applied migration — is the wrong one. | Rehearse a deployment against a copy of a populated database before there is anything to lose. |
| The readiness score has unfinished constants | It is the number the product is judged on, and changing it after it has history is expensive. | Settle the constants at M6, as planned, with the split re-examined before any non-engineering role. |
| Voice latency has never been measured from Nigeria | A sub-one-second target is an assumption until someone measures it on a real connection. | Measure early in M5, before the provider contracts matter. |
| Speech-to-text accent performance is unproven | Accent-robustness is one of the four product principles, and the samples to test it do not exist. | Start collecting consented Nigerian-accented audio before M5, not during it. |
| The Termii sender ID is an approval, not a signup | Phone OTP is a primary sign-up method; without an approved DND sender ID, SMS does not reach most Nigerian numbers. | Start that application well before a launch date is chosen. |
| No legal pages exist | The landing page has nothing to link to, and a data-protection review needs them. | Draft privacy, terms and refunds from the subprocessor register, which already describes what the system actually does. |
| Scope: coding interviews are phase 2 | They are the round candidates most often fail for three of four launch roles. | Decide before M3 is planned — it is much cheaper now than after M4 assumes every answer is prose. |

### 8.1 A suggested order

1. Merge the content branch, and start expert review of the question banks in parallel with engineering.
2. Retrofit the frontend and backend follow-up probes — the interview engine needs them on two of the four launch roles.
3. Build M3. Nothing outside blocks phases one to four; only Langfuse keys are needed for phase five.
4. Rehearse a deployment against a populated database copy while M3 is in flight, so the migration hazard is met in a rehearsal rather than on launch day.
5. Start the slow external items now, not when they are needed: the domain, Resend domain verification, the Termii sender-ID approval, and the hosting decision.
6. Build M4, and commission the human-scored gold set the agreement metric needs — it cannot be generated.

## 9. Appendices

### Appendix A — Every API route

Global prefix `/api`, except the health check. Fifty-nine routes, of which three are public.

| Method | Path | Access |
| --- | --- | --- |
| ALL | /api/auth/*  (Better Auth: sign-up, sign-in, reset, verification, Google, phone OTP) | Public by construction |
| GET | /api/auth-methods | Public |
| GET | /health | Public |
| GET | /api/dev/mailbox | Public, outside production only |
| GET | /api/me | Session |
| POST | /api/me/onboarding/complete | Session |
| GET / PUT | /api/me/profile | Session |
| GET / PUT | /api/me/consents | Session |
| GET | /api/me/cv | Session |
| POST | /api/me/cv/uploads | Session |
| POST | /api/me/cv | Session — confirms the upload and starts parsing |
| PUT | /api/me/cv/parsed | Session |
| DELETE | /api/me/cv | Session |
| GET | /api/me/export | Session, rate-limited, never cached |
| POST | /api/me/deletion | Session, typed confirmation, recent sign-in |
| GET | /api/content/career-roles | Session |
| GET | /api/content/track | Session |
| GET | /api/content/practice | Session |
| GET | /api/content/lessons/:slug | Session |
| GET | /api/admin/stats | Role: admin |
| GET / POST | /api/admin/content/topics   ·   PUT /topics/:id | Role: content_expert or admin |
| GET / POST / PUT | /api/admin/content/career-roles (+ /:id) | Role: content_expert or admin |
| GET / POST / PUT | /api/admin/content/career-levels (+ /:id) | Role: content_expert or admin |
| GET / POST / PUT | /api/admin/content/stacks (+ /:id) | Role: content_expert or admin |
| GET / POST / PUT | /api/admin/content/tracks (+ /:id)  ·  POST /tracks/:id/modules  ·  PUT /modules/:id | Role: content_expert or admin |
| GET / PUT | /api/admin/content/lessons (+ /:id)  ·  POST /modules/:id/lessons | Role: content_expert or admin |
| GET / POST / PUT | /api/admin/content/rubrics (+ /:id) | Role: content_expert or admin |
| GET / POST / PUT | /api/admin/content/questions (+ /:id)  ·  POST /questions/duplicate-check | Role: content_expert or admin |
| POST | /api/admin/content/:entity/:id/transition | Role-gated; publish and retire require admin |
| POST | /api/admin/content/:entity/:id/reviewed | Role: content_expert or admin |
| GET | /api/admin/content/:entity/:id/versions (+ /:version) | Role: content_expert or admin |

### Appendix B — Commands

| Command | What it does |
| --- | --- |
| pnpm prereqs | Check Node, pnpm, uv, Python, Docker and Compose |
| docker compose -f infra/docker-compose.yml up -d | Start Postgres, Redis, object storage and LiveKit |
| pnpm install | Install every workspace |
| pnpm db:migrate | Apply database migrations |
| pnpm storage:setup | Create the bucket, CORS and the upload-expiry rule |
| pnpm dev  /  pnpm dev:worker | Run web and API  /  run the Python worker |
| pnpm lint && pnpm typecheck && pnpm test | Every check, TypeScript and Python |
| pnpm test:e2e | Playwright, against built applications on their own ports and database |
| pnpm gen:contracts  /  pnpm check:contracts | Regenerate the contract chains  /  fail on drift, as CI does |
| pnpm db:seed  (-- --dry-run, -- --force) | Import the seed content |
| pnpm --filter @readi/api admin:grant -- --email <address> --role admin | Grant a role (audited; refuses in production without an acknowledgement) |
| pnpm --filter @readi/api content:reembed -- --dry-run | Re-embed published questions after an embedding change |
| node .claude/skills/question-bank/scripts/check-bank.mjs | Offline checks on the question banks against their blueprints |
| E2E_SCREENSHOTS=before pnpm test:e2e visual | 80 screenshots across 34 screens, two widths, two themes |
| E2E_SLOW_NETWORK=1 pnpm test:e2e slow-network | Page weight and load time on a Slow 4G profile |

### Appendix C — Terms used in this document

| Term | Meaning |
| --- | --- |
| Rubric | How one answer is scored: three to five weighted criteria, each with five descriptors from 0 to 4. Weights must total 100 before it can be published. |
| Planned follow-up (probe) | One spoken sentence attached to a question, aimed at a criterion the opening question does not ask for. A menu the engine draws from, not a script. |
| Answer key | Everything a candidate must never see: rubrics, criteria, level descriptors, ideal points and planned follow-ups. |
| Stack variant | A technology flavour of a role — “Java / Spring”, not “Java”. A question with no variant tags is general to its role; with tags it is offered only on those variants. |
| Track | A learning programme for one role and level pair. At most one may be published per pair. |
| seed_managed | A flag saying the file in /content/seed is still the source of a row. It flips to false on the first save in the CMS, and the importer then leaves that row alone. |
| Tombstone id | The replacement identity written into records that must be kept after an account is erased, so the record survives and the person does not. |
| Entitlement | The only thing that grants access to a paid feature, updated only by a verified payment webhook or an audited admin action. |
| Readiness band | Getting started (under 40), Developing (40–59), Nearly ready (60–74), Ready (75 and above, and never with fewer than three completed sessions). |

---

*Prepared from the repository at commit 9a646ec, 24 September 2026. Every figure in this document was generated from the source, the schema, the tests and the git history rather than from the plan.*


# Subprocessors

Third parties that process personal data on Readi's behalf. Required by the NDPA 2023 (and the GDPR
for users in the EU/UK), and the basis of the data-processing agreements we sign with customers and
partners. **Keep this list accurate**: adding a subprocessor is a decision, not a dependency bump —
see the checklist at the end.

Status: **M1**. Nothing here is a legal opinion; this file is what the system actually does, which is
what legal review needs as input.

Last reviewed: 2026-09-21 (M2 phase 3: Voyage AI wired, still disabled).

## In use today

| Subprocessor | Purpose | Personal data it receives | Processing region | Retention there |
|---|---|---|---|---|
| **Anthropic** (Claude API) | Reads an uploaded CV into structured fields (ADR-0010) | CV text, including whatever contact details the file itself contains; plus the target role and level. No account id, email or phone | United States | Per Anthropic's API terms: inputs and outputs are not used for training, and are retained only briefly for abuse monitoring |
| **Resend** | Transactional email: address verification, password reset, account-deletion notice | Email address, message content | United States / EU (per account configuration) | Delivery logs per Resend's retention settings |
| **Termii** | SMS: one-time codes, account-deletion notice, renewal reminders (from M8) | Phone number, message content | Nigeria | Per Termii's retention |
| **Cloudflare R2** (production) | Object storage for uploaded CV files (ADR-0001, ADR-0010) | The CV file itself | Configurable; EU or US depending on the bucket | Until the user replaces or deletes the CV, or the account is erased (ADR-0011). Unconfirmed uploads expire after 1 day |
| **The application host and managed Postgres/Redis** | Runs the app and its database | All account data | To be decided before launch — record it here | Backups per the provider |

Locally and in CI these are replaced by the console email/SMS providers (dev mailbox), SeaweedFS and
`LLM_PROVIDER=fake`, so development and tests reach no third party.

## Configured but not yet enabled

Wired into the code and switched off unless a DSN or key is set; no personal data reaches them today.
They become subprocessors the moment they are enabled in an environment that serves real users.

| Subprocessor | Purpose | What it would receive |
|---|---|---|
| **Sentry** | Error reporting | Error events with **no** request bodies, cookies or secret headers, and no stack-frame locals. All three SDKs are configured that way and each has a test. `sendDefaultPii: false` alone does **not** do this in the JavaScript SDKs — the HTTP integration captures bodies unless `maxIncomingRequestBodySize: "none"` is set, which is why every event also goes through a scrubber. User ids only |
| **PostHog** | Product analytics (M9) | Opaque user ids and event names |
| **Voyage AI** | Embeddings for question near-duplicate detection and, later, question retrieval (ADR-0006) | **No personal data.** Only the text of our own questions — a prompt and its setup — written by content experts. No candidate answers, no account ids. Off until `EMBEDDING_PROVIDER=voyage` and a key are set; the default fake provider reaches no third party (see `docs/runbooks/embeddings-switchover.md`) |

## Planned, by milestone

Add each to the table above — with its region and retention — in the milestone that enables it.

| Subprocessor | Purpose | Milestone |
|---|---|---|
| LiveKit Cloud | Real-time audio for voice interviews | M5 |
| Deepgram (or AssemblyAI) | Speech to text | M5 |
| ElevenLabs (or Cartesia) | Text to speech | M5 |
| Langfuse (EU) | LLM tracing; treated as a personal-data store (ADR-0008) | M3 |
| Paystack | Payments in Naira | M8 |
| Stripe | Payments in USD | M8 |
| Meta (WhatsApp Cloud API) | Reminders on WhatsApp | Phase 2 |

## What we promise users about these

- **Deletion reaches them.** Account erasure removes the CV file from object storage and, once
  Langfuse is enabled, the user's traces (ADR-0008, ADR-0011). Email and SMS providers keep only
  delivery logs, which age out on their own schedule.
- **We send the minimum.** The worker receives a CV and the target role — never the account's name,
  email, phone or id (ADR-0004). AI calls are recorded locally as cost rows without content (ADR-0007).
- **No training on candidate data.** Providers are chosen so that inputs are not used to train their
  models; check this at renewal, not just at signup.
- **Uploads that are never confirmed** sit under `cv-uploads/<upload id>` rather than a per-user
  folder, so account erasure does not target them; the bucket's 1-day expiry rule removes them
  well inside the 7-day grace period, which is why erasure does not need to. That rule is applied
  by `pnpm storage:setup` and must exist on the production bucket.
- **Camera coaching never leaves the device.** MediaPipe runs in the browser and only numeric metrics
  are sent to us (spec §8), so no third party sees video.

## Adding a subprocessor

1. Record why, in the ADR or milestone that introduces it.
2. Add a row above with purpose, data categories, region and retention **before** it goes live.
3. Check: is there a DPA? Are inputs excluded from training? Can we delete a single user's data?
4. Make sure account erasure covers it (`eraseUser` and ADR-0011's list).
5. If it is in a new country, say so here — data-transfer questions start with the region.

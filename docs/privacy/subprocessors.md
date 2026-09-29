# Subprocessors

Third parties that process personal data on Readi's behalf. Required by the NDPA 2023 (and the GDPR
for users in the EU/UK), and the basis of the data-processing agreements we sign with customers and
partners. **Keep this list accurate**: adding a subprocessor is a decision, not a dependency bump —
see the checklist at the end.

Status: **M1**, plus the five speech and media vendors M5 configures (below, not yet enabled for
candidate data). Nothing here is a legal opinion; this file is what the system actually does, which is
what legal review needs as input.

Last reviewed: 2026-09-29 (M5 phase 2: the five speech/media vendors added with their terms read on
that date, and the ElevenLabs retention gap recorded as a gap). Before that: 2026-09-26 (M4 phase 0: the reviewers recorded as contracted processors; the Anthropic row corrected — it had described CV parsing
alone since M1, and candidate answers have gone there since M3 — and the calibration reviewers
recorded below).

## In use today

| Subprocessor | Purpose | Personal data it receives | Processing region | Retention there |
|---|---|---|---|---|
| **Anthropic** (Claude API) | Three things, not one. Reads an uploaded CV into structured fields (ADR-0010); phrases the interviewer's questions and follow-ups and judges whether an answer has already covered a probe (M3); and from M4 scores each answer against its rubric | CV text, including whatever contact details the file itself contains; **the candidate's interview answers as they typed them**; the questions and rubrics our own staff wrote; and the role, level and stack as labels. No account id, email or phone — the opaque `user_id` that crosses to the worker goes on the Langfuse trace and reaches no prompt (ADR-0008) | United States | Per Anthropic's API terms: inputs and outputs are not used for training, and are retained only briefly for abuse monitoring |
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
| **Langfuse Cloud (EU)** | LLM tracing: the prompts and answers behind CV parsing and every interview turn, for prompt debugging and M4's evals. Treated as a **personal-data store**, not a log sink (ADR-0008) | The prompt and the model's answer, which means CV text and candidate answers; plus the opaque `user_id` and `session_id`, the model, the token counts and the latency. Emails, phone numbers, URLs and street addresses are masked in the worker before anything is sent. **No name, no email, no phone number, no account email.** Off until `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are both set; without them nothing is constructed and nothing is sent |

### The speech and media vendors (M5), as their own terms read on 2026-09-29

Keys exist in the worker's untracked configuration; **no candidate audio has been sent to any of
them**, and `VOICE_ENABLED` is false. `STT_PROVIDER` and `TTS_PROVIDER` remain `fake`, so the resting
state of a development stack still reaches no third party. Each row's "what keeps our data out of its
training set" is also written in `readi_worker/speech/providers.py`, beside the parameter or the base
URL that enforces it — because a promise that lives only in this file is a promise no test can keep.

| Subprocessor | Purpose | What it would receive | Region | Training and retention, as their page reads |
|---|---|---|---|---|
| **LiveKit Cloud** | Real-time audio transport for a voice interview | The candidate's speech, in transit, plus an opaque participant identity | Global mesh by default; the nearest region group to Nigeria is **Africa = one location in South Africa with no in-region redundancy**. Region pinning is not self-service and removes failover | Media is relayed, not stored, unless egress/recording is enabled — which we do not enable. Confirm in writing before launch |
| **Deepgram** | Speech to text | Everything the candidate says | United States | Training happens only through their voluntary Model Improvement Partnership, and `mip_opt_out=true` is sent on **every** request we make; "Data from opted-out requests is retained only for the duration necessary to process the request." **Open question:** their page never states whether self-serve accounts are enrolled by default — answer owed in writing |
| **AssemblyAI** | Speech to text | Everything the candidate says | **EU** (`api.eu.assemblyai.com`, chosen for this reason, not for latency) | "We will not use files you submit for model training if you… are utilizing our European servers", and "zero data retention of audio and transcripts for our Streaming product" |
| **ElevenLabs** | Text to speech: the interviewer's voice | **Only the interviewer's own words** — never a candidate's speech or writing. But those words include the planned follow-up probes, which are answer key | United States / Netherlands / Singapore (`api.elevenlabs.io`; residency hosts exist) | **A known gap, accepted for development only** (owner's decision, 2026-09-29). They train on self-serve data by default; the account-level "Improve the models for everyone" toggle is **off** as of 2026-09-29, which is the only lever a self-serve plan has. Zero Retention Mode (`enable_logging=false`) is **Enterprise-only**, so request history is retained. **Revisit before real users:** Enterprise, or a vendor whose no-retention mode is available to us |
| **Intron Health ("Sahara")** | Speech to text for African accents — benchmark reference only, not the live path | Benchmark clips from consented speakers; **no candidate audio** | Not stated anywhere | **Unresolved, and a blocker for their use on human recordings.** Their only formal privacy policy and terms are dated **January 2020**, which predates the voice API; nothing on the API docs site covers retention or training. A written answer from them is owed before a single consented recording is sent. Their transcripts are also LLM-post-corrected by default; we send `use_disable_llm_corrections=true` |

**The benchmark speakers are not users** (ADR-0020 §8). They have no account, so their consent is a
signed form kept outside the application, their audio never enters the product's database or buckets,
and the form must be able to say truthfully that clips are not used to train anybody's model — which
is why the Intron row above is a gate rather than a note.

## Planned, by milestone

Add each to the table above — with its region and retention — in the milestone that enables it.

| Subprocessor | Purpose | Milestone |
|---|---|---|
| Paystack | Payments in Naira | M8 |
| Stripe | Payments in USD | M8 |
| Meta (WhatsApp Cloud API) | Reminders on WhatsApp | Phase 2 |
| Contracted calibration reviewers (people, not a service — see below) | Blind-scoring sampled answers so the evaluator's fairness can be measured | M4 |

## People, not services: the calibration reviewers

M4 adds an internal calibration tool (spec §4.4): a content expert is shown a sampled answer
**without** the model's score and scores it by hand, so that agreement between the model and a human
can be measured. That is a person reading what a candidate typed, and it is the one processing
purpose in the product that no third-party service performs.

- **The lawful basis is the candidate's consent**, `transcript_review` — opt-in, default off,
  revocable, and declining costs the candidate nothing (ADR-0017). Nothing may sample an answer
  without it; `ConsentsService.usersGranting("transcript_review")` is the only set a sampler may draw
  from, and the rule behind it is `isCurrentGrant`, so a consent granted against older wording does
  not count.
- **What a reviewer sees** is the question, the rubric and the answer. Not the candidate's name,
  email, phone number or CV — the tool identifies the answer by ids.
- **The reviewers are contractors, so they are processors** (owner's decision, 2026-09-26). They are
  senior engineers outside the company, paid per review, engaged under contract rather than employed.
  Each therefore needs a data-processing and confidentiality agreement before they are given access:
  `docs/privacy/reviewer-agreement.md` is the **draft** template, and it says on its face that a
  lawyer familiar with the NDPA 2023 must review it before anybody signs.
  **Phase 6 of M4 does not go live with real reviewers until a signed agreement is in place**, which
  is a gate on the milestone rather than a note in it. Named, individual contractors are not listed
  as rows in the table above — that table is for services we send data to — but they are processors
  in exactly the same sense, and a DPA we sign with a customer or a partner has to be able to say so.
- **Access is logged.** A staff member reading a candidate's words is an audited event, like every
  other privileged action (ADR-0011's audit rules).

## What we promise users about these

- **Deletion reaches them.** Account erasure removes the CV file from object storage and the
  user's LLM traces (ADR-0008, ADR-0011) — both **before** the database transaction, so a failure
  retries the whole erasure rather than stranding data nothing can find. Traces also age out on
  their own, after `LANGFUSE_RETENTION_DAYS` (30), on the same hourly sweep. Email and SMS
  providers keep only delivery logs, which age out on their own schedule.
- **We send the minimum.** The worker receives a CV or an answer, the target role, and two opaque
  uuids (the account and the session) — never a name, an email or a phone number (ADR-0004). The
  ids exist so that a trace can be found and deleted again (ADR-0008); nothing renders them into a
  prompt. AI calls are recorded locally as cost rows without content (ADR-0007).
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

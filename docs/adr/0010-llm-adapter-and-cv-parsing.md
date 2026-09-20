# 0010 — LLM adapter and CV parsing: browser upload to storage, extraction in the worker

**Status:** Accepted · **Date:** 2026-09-19

## Context
M1 needs CV upload (PDF/DOCX ≤ 5 MB, type-checked server-side) and a structured parse the candidate
can edit (spec §4.1). It is the first external AI call, so it also sets the LLM adapter, prompt,
retry, and cost-recording patterns every later AI feature reuses. Constraints: all provider calls in
the worker (ADR-0004), the worker has no database or storage credentials it does not need, cost in
integer micro-USD (ADR-0007), untrusted files, Nigerian mobile connections, and CVs are personal data.

## Decision
**Upload.** The browser asks the API for a presigned `PUT` whose content type and exact length are
signed, uploads straight to object storage (no file bytes through the API or web servers), then
confirms. Uploads land in a quarantine prefix (`cv-uploads/`, expired after 1 day by a lifecycle
rule). On confirm the API checks the stored size and the file signature (`%PDF-`, or a ZIP for
DOCX), deletes anything that fails (422), copies the file to `cvs/<user>/<upload>.<ext>`, and queues
a BullMQ job. Upload URLs (10/h) and parses (5/h, 15/day) are rate-limited per user. SeaweedFS was
verified to enforce the signed length and type and the bucket CORS (tests); R2 supports the same.

**Parsing.** The job sends the file (base64, in the request body per ADR-0004) with only target
role and level to the worker's `POST /cv/parse`, authenticated by a shared service token. The worker:
- extracts text with pypdf / python-docx under limits (20 pages, 40k characters, 30 MB uncompressed
  DOCX, 20 s), skips DOCX headers/footers (contact details), and reports scanned or encrypted files as
  `unreadable` without calling a model;
- renders a versioned Jinja2 prompt (`prompts/cv_parse.v1.md`) with the CV text wrapped as data in
  `<cv_text>` tags (copies of the tags inside the text are neutralised) and an instruction to ignore
  instructions in it and never output contact details;
- calls the model through `LLMClient` with schema-constrained structured output, retrying invalid
  output up to twice (a refusal is not retried), then normalises: trims, de-duplicates, applies the
  contract's limits, and strips links, emails and phone numbers as defence in depth;
- returns the `ParsedCv` plus one `AiCallRecord` per model call (tokens, latency, cost).

The API stores records in `ai_call_log` and the result on the profile; stale jobs (CV replaced or
deleted) are no-ops. Transport failures retry with backoff, then mark the CV `failed`.

**Adapter.** `LLMClient` (worker) with `AnthropicLLMClient` (Messages API, `output_config.format` from
the SDK's `transform_schema`; `effort: low` where supported; no sampling parameters, which current
models reject) and deterministic fakes for tests and for local work without a key
(`LLM_PROVIDER=fake`). Model from `LLM_MODEL_CV_PARSE`, default `claude-sonnet-5` (owner decision);
prices in `readi_worker/llm/pricing.py` as micro-USD per million tokens. A comparison script runs the
production pipeline on a local folder of CVs with several models side by side.

## Consequences
- The web app needs direct network access to the storage endpoint (bucket CORS for the web origin;
  `pnpm storage:setup` applies it). CI starts SeaweedFS for the storage and CV tests.
- CV text crosses API → worker → provider; the worker logs only request ids and outcomes.
- The parsed CV is candidate-editable personal data on `profiles`, deleted with the account.
- Price tables must be kept current; unknown models are logged and costed at 0.

## Alternatives considered
- **Upload through the API** — simpler, but 5 MB bodies through two servers on slow connections, and
  the API holding untrusted bytes in memory.
- **Extraction in the API (Node PDF libraries)** — puts untrusted-file parsing in the process that
  holds database credentials.
- **Presigned POST with a content-length-range policy** — not supported by R2.
- **SDK `messages.parse`** — raises on truncated or refused output before `stop_reason` can be read,
  so refusals would be retried like invalid output (found by a mocked-API test).

# ADR-0016 — Interview transport: whole-turn frames over SSE, and events that ride the response

- **Status:** accepted
- **Date:** 2026-09-25
- **Context:** M3 phase 3 (the interview engine, text mode)
- **Supersedes:** nothing. **Relates to:** ADR-0003 (Zod is the source of truth), ADR-0004 (the
  worker has no database access), ADR-0012 (the web client), ADR-0013 (the interview screen).

## Context

M3 puts a deterministic interview engine in the AI worker (ADR-0004) and a chat screen in the web
app. Between them sit two hops with different problems.

**Browser ↔ API.** One exchange usually produces two or three things to show: an intro and the first
question; a follow-up; the close and the end. Between the candidate pressing send and the first of
them appearing, the API makes up to two model calls. On a Nigerian mobile connection that is a long
time to look at a screen that has not changed.

**API ↔ worker.** The worker owns the engine's state but not the database. Whatever it decides has
to reach the API to be persisted — the turns, where the engine now stands, and what the model calls
cost for `ai_call_log` (ADR-0007). ADR-0004 left open how: an HTTP batch back, or a Redis stream.

Three constraints shaped the answer. Every AI call is schema-validated structured output, so there
is no partial object to stream (CLAUDE.md "Evaluation"). The browser reaches the API same-origin
through Next's `/api/*` rewrite, so anything we send passes through `proxy.ts` **and** the rewrite.
And M5 replaces text with voice, where the LiveKit agent drives turns itself and sub-second latency
is a product requirement — so whatever is built now should be something M5 extends rather than
replaces.

## Decision

### 1. Browser ↔ API is Server-Sent Events, carrying whole turns

`POST /api/interviews/:id/advance` responds `text/event-stream`. Each frame is one `data:` message
holding one JSON object with a `type` discriminator: `thinking`, `turn`, `question`, `state`,
`error`, `done` (`InterviewFrame` in `@readi/shared-types`).

**Whole turns, not tokens.** A turn is a schema-validated object before it is anything; there is no
half-turn to send. Token streaming waits for M5, where voice latency needs it and where the model
call is a different shape.

**What SSE buys in M3, stated honestly.** Not incremental generation — the worker answers a whole
exchange at once, so the turns arrive together. It buys three things: the `thinking` frame, sent
*before* the worker is called, so the screen shows the interviewer composing the instant the
candidate presses send; a heartbeat (`INTERVIEW_SSE_HEARTBEAT_MS`) that keeps whatever sits between
the API and a mobile browser from closing a connection it thinks is idle, and that tells the screen
the difference between "still composing" and "we have lost you"; and a channel M5 reuses unchanged.

**Not `EventSource`.** The route is a POST with a body and a session cookie, which `EventSource`
cannot do. The browser reads it with `fetch` and a `ReadableStream` reader, which is also why frames
are JSON with their own discriminator rather than SSE `event:` names — one JSON object per message is
less client code than SSE's field syntax. The generated API client does not model streaming
responses (ADR-0012), so `lib/interview-stream.ts` is the one hand-written client module and the
OpenAPI document declares the route as `text/event-stream`.

**Not Nest's `@Sse()`.** It is built for GET and for an Observable Nest subscribes to; this needs a
POST body and a heartbeat interleaved with an `await`. `InterviewStream` writes the response
directly, validating every frame against the contract on the way out.

### 2. Where a refusal appears depends on when it happens

Anything knowable **before** the stream opens is an ordinary HTTP error with an `ApiError` code:
`interview_not_found`, `interview_ended`, `interview_expired`, `interview_busy`, and request
validation. Once the headers are sent the status is already 200, so a failure after that is an
`error` frame. Nothing between `stream.open()` and `stream.close()` may throw.

### 3. Events ride the response (the ADR-0004 open question)

In text mode every worker call is initiated by the API, so a whole exchange comes back in one
response body: turns, engine state, `prompt_versions` and `ai_calls`. The API persists the turns
idempotently by `(session_id, seq)`.

Chosen over a Redis stream: no second consumer runtime inside Nest, and one direction of
authentication today. M5 adds the push direction — an authenticated HTTP batch with the same
idempotency key — when the LiveKit agent drives turns itself and there is no API request to answer.

The hop between API and worker stays plain JSON. Whole-turn frames make a streaming hop between two
servers pointless.

### 4. An exchange is all-or-nothing, and the request's snapshot is the authority

Neither side stores anything until the exchange completes. So a broken stream, an API timeout or an
unreachable worker leaves the session exactly where it was, and the same action is simply sent
again — replayed idempotently, because the engine allocates the turn seqs.

The worker keeps the live engine state in Redis with a TTL, but **what the API sends wins**: the
API's copy is what has actually been persisted, so replaying an exchange whose response reached the
worker's Redis and not the database is correct, and trusting Redis would skip ahead and leave a hole
in the transcript.

Redis is therefore a cache for the **session bundle** — four to eight pinned questions with their
setup material, which would otherwise be resent on every turn. When it has gone the worker answers
`bundle_required` and the API sends the bundle again. That error is the only way the API can learn
of a Redis miss inside the worker.

### 5. A model that will not answer does not end the interview

Phrasing calls fall back to the pinned, staff-written wording already on the wire: a question to its
own prompt, a follow-up to its own probe, the close to a fixed line. The candidate gets a plainer
interview rather than a broken one, and the failure is in `ai_calls`. The single exception is
answering a question the *candidate* asked, where there is nothing honest to fall back to.

## Consequences

**The transport was proved before anything was built on it.** `scripts/sse-rewrite-proof.mjs` runs a
stub origin that emits frames on a known schedule behind a production `next start`, reads them
through `/api/*`, and fails if they do not arrive one at a time. Measured 2026-09-25: five frames
300 ms apart arrived at 330, 625, 926, 1226 and 1527 ms, with no `content-length` and
`transfer-encoding: chunked` — `proxy.ts` and the rewrite forward an event stream unbuffered. It is a
committed script rather than a note because the answer could change with a Next upgrade.

**Timeouts are sized from the candidate's side.** An exchange chains two model calls, each bounded in
the worker by `INTERVIEW_LLM_TIMEOUT_S` (45 s) — far shorter than `LLM_TIMEOUT_S` (90 s), which is
right for a CV parsed in a background job and wrong for somebody watching a spinner.
`AI_WORKER_TIMEOUT_MS` (150 s) covers the normal worst case with room for one retry, and is
deliberately not sized for the pathological one: the API giving up costs a wasted call and a replay,
not a session.

**One exchange at a time per session.** A double-tapped send would otherwise run two exchanges from
one snapshot, allocate the same seqs and collide on `(session_id, seq)` — a 500 for what is really
"you already sent that". A Redis lock refuses the second with `interview_busy`, held for the worker
timeout plus slack so a process that dies mid-exchange cannot lock a candidate out for longer.

**Ordinary HTTP is now insufficient for one route.** Anything that proxies, caches or compresses in
front of the API must leave `/api/interviews/*/advance` alone; the response carries
`cache-control: no-transform` and `x-accel-buffering: no` to say so.

**Turn timing means something in text mode.** A candidate turn spans the interviewer finishing to
their answer arriving — the time they spent reading and typing, which M6's pace coaching needs when
there is no audio. An interviewer turn spans the request arriving to the response coming back: the
latency the candidate actually waited (CLAUDE.md "log per-stage latency").

## Alternatives considered

**A plain JSON response per exchange.** Simplest, and it is what the API ↔ worker hop does. Rejected
for the browser hop because the candidate would stare at an unchanged screen for the length of two
model calls with no way to tell a slow answer from a lost connection — and because M5 would have to
replace it rather than extend it.

**Token streaming now.** Rejected: the output is schema-validated structured JSON, so there is no
meaningful partial turn, and CLAUDE.md's schema-validation rule wins over the M3 prompt's "stream
interviewer text" (corrected in `docs/PROMPTS.md` in the same change, per CLAUDE.md §7.4).

**WebSockets.** More capability than a one-way stream of turns needs, plus its own auth story
alongside the session cookie. LiveKit already brings a real-time channel in M5, and nothing here
would carry over.

**A Redis stream from worker to API.** Rejected as ADR-0004 anticipated: it means a consumer runtime
inside Nest and a second direction of authentication, for no benefit while the API initiates every
call.

**Polling.** Rejected: the same latency as a plain response with more requests, and nothing to show
while waiting.

# ADR-0019 — Voice transport: the agent drives the engine, turns are pushed, and the budget is what the stages allow

- **Status:** accepted
- **Date:** 2026-09-29
- **Context:** M5 phase 0 (voice mode)
- **Supersedes:** nothing. **Amends:** the latency target in spec §8 (below). **Relates to:**
  ADR-0004 (the worker has no database access), ADR-0007 (AI cost), ADR-0008 (Langfuse holds
  personal data), ADR-0016 (interview transport, which left the push direction open), ADR-0017
  (transcript review).

## Context

M5 adds voice to the interview engine M3 built. Three facts decide almost everything.

**The engine is in the worker and the database is behind the API** (ADR-0004). In text mode the API
initiates every exchange, so turns, `prompt_versions` and `ai_calls` ride the response home
(ADR-0016 §3). In voice there is no API request to answer: the candidate stops speaking and the
interviewer has to reply. ADR-0016 named that gap and left it for here — "M5 adds the push
direction — an authenticated HTTP batch with the same idempotency key".

**Spec §8 asks for a voice turn under ~1 s at p50.** Adding up the stages says that is not
reachable: turn detection 250–700 ms, STT final 100–300 ms, the coverage call 800–1,500 ms, the
phrasing call 700–1,200 ms, TTS first byte 150–400 ms — 2.0–4.1 s with the two sequential model calls
M3 makes per answer, and 1.2–2.2 s with one. A number we cannot meet is worse than no number,
because it stops being a test.

**Local development cannot measure any of this.** A Windows browser into LiveKit inside WSL gets no
UDP forwarded and falls back to ICE-TCP on loopback (ADR-0001). Function can be tested locally; time
cannot.

## Decision

### 1. Voice is a transport. The agent drives the *same* engine, in-process

The LiveKit agent calls `InterviewService.advance()` directly — the same `machine.py`, `probes.py`,
`transitions.py`, budgets, asks guard and fallbacks that text mode uses. There is no second engine,
no second copy of a budget rule, and no state machine expressed twice. CLAUDE.md's "text mode and
voice mode share the same engine; voice is just a different transport" is implemented literally.

### 2. The agent is its own process

`readi_worker/voice/`, started as `pnpm dev:voice`, registering with LiveKit and receiving dispatched
jobs. It is not an HTTP route: a LiveKit agent is dispatched to a room, not called. It also pulls in
a VAD model, a turn-detector model and an ONNX runtime, which have no business inside the
API-facing FastAPI app.

### 3. Turns are pushed to the API, idempotently, and off the critical path

`POST /api/internal/interviews/:id/turns`, service-token authenticated, carrying exactly what an
exchange produced: turns, the engine snapshot, `prompt_versions`, `ai_calls`, and the per-turn
latency samples voice adds. The API persists it through the **same** `applyExchange` text mode uses,
idempotent by `(session_id, seq)`, with an `exchange_id` covering the rows that have no natural key.

**The push happens after the interviewer starts speaking, not before.** A database write between the
model's answer and the first audio byte would be latency the candidate pays for nothing. A failed
push is retried; a session whose pushes are all lost still ends up consistent, because the engine
allocates the seqs and the API's snapshot is the authority (ADR-0016 §4).

### 4. The answer key never enters the room

Room metadata and data channels are readable by participants, and `BundleQuestion` carries
`planned_follow_ups` — which are answer key (ADR-0014, CLAUDE.md §5). So the dispatch carries the
**session id and nothing else**, and the agent pulls the bundle over the service-token channel. The
leak fixture gains the room's payloads: a probe may appear in a turn the interviewer has **spoken**,
and nowhere else.

### 5. The latency target, restated so it can be tested

Spec §8's "< ~1 s p50" is amended to two numbers, because they are two different promises:

- **First audio under 250 ms at p50** — the interviewer acknowledges the answer immediately.
- **The substantive reply within 1.5–2.5 s at p50**, measured end-of-speech to the first audio byte
  of the question or probe.

And a ladder of levers, in the order they are applied, with the cheap ones first:

1. **The engine's own words are pre-rendered audio.** The acknowledgements and connectives are
   pinned, staff-written and few, so they are synthesized once and cached. No model call, no TTS
   round trip, first byte in tens of milliseconds.
2. **The next opening is phrased and synthesized during the candidate's answer.** The next question
   is deterministic, so this is prefetching and not speculation.
3. **The coverage call may be fired on the interim transcript** at a brief pause, before the turn
   detector commits, and discarded if the candidate carries on. Costs tokens, removes a whole call
   from the path.
4. **The remaining probes may be phrased speculatively** while the coverage call runs (at most four,
   short outputs), and the losers thrown away.

3 and 4 are built **only if phase 8's measurements ask for them**. 1 and 2 are built now.

**The two calls are never merged into one.** A single call returning both the coverage flags and the
phrased probe lets the model effectively choose which probe is asked, which is the thing
`planned_follow_ups` exists to prevent (owner's decision, 2026-09-23), and it would still need the
engine to discard a phrasing for a probe it did not pick — all of the risk for half of the saving.

### 6. The acknowledgement is the engine's, rotated, and never evaluative

A small pinned set of short, neutral acknowledgements — "Okay.", "Mm-hm, got it.", "Thanks." — chosen
deterministically from the session id and the turn, the way `transitions.py` already chooses a
connective, so it varies within a session, varies between sessions and stays reproducible. One fixed
line would sound like a machine by the third question.

**Nothing in the set may sound like approval** (owner's decision, 2026-09-29). A candidate who has
just given a wrong answer must not hear "Great, thanks" and then read a report that contradicts it;
praise is the evaluator's to give or withhold, and it is given from a rubric. A test asserts the set
contains no evaluative word.

### 7. Falling back to text needs no handover

The API's persisted snapshot is already the authority (ADR-0016 §4), so a fallback is: the agent
stops, the browser resumes over SSE from what is stored, and the interview continues at the same
turn. Nothing is handed over and nothing can be half-handed-over.

`interview_sessions.mode` keeps meaning **how the session started**. The fallback is an event with a
reason, not a rewrite of history, and delivery metrics run over the turns that have word timings —
which is self-describing, because only voice turns have them.

### 8. A question the candidate talked over records how far it was spoken

Barge-in is allowed and encouraged. But the evaluator later reads "the question that was asked" and
the report shows it to the candidate, so the turn records the full generated text **and** how much of
it was actually heard (`spoken_ms`, `interrupted`). A question cut off half way and answered anyway
is fair to score — only if the record says that is what happened.

## Consequences

- **A second direction of authentication exists now.** The worker holds a token that lets it write
  turns for a session. It is the same shared `SERVICE_TOKEN` in the other direction, and the routes
  it reaches are internal, not candidate-facing: `/api/internal/interviews/:id/{bundle,turns,voice-ended}`.
- **Two writers of one session must not overlap.** A voice session's browser cannot also `POST
  /advance`: the agent holds the session for the length of its leg, and the existing Redis lock is
  what refuses the second writer (`interview_busy`). A fallback releases it.
- **Audio stays out of the database entirely** unless `recording_storage` is granted; see the privacy
  decisions in `docs/plans/m5-voice.md` and the M5 subprocessor rows.
- **TTS receives no candidate data** — only the interviewer's own words — which keeps one vendor
  almost entirely out of the personal-data path. STT receives everything the candidate says.
- **Cost per session is dominated by the speech vendors, not the model.** A 15-minute voice session
  is roughly 2.5–3.5× a text one, and most of the difference is STT minutes and TTS characters. That
  makes "how many words the interviewer says" a cost lever as well as a product one.
- **The acceptance criterion needs a deployment.** Function is testable locally with a fake media
  device and fake STT/TTS; the latency numbers need LiveKit Cloud, a hosted agent in a chosen region
  and a throwaway staging environment (M5 phase 8).

## Alternatives considered

**The API stays the driver: the agent calls `/advance`.** One writer, no new direction of
authentication, and the persistence path untouched. Rejected on latency: it puts an HTTP hop *and*
the database write between the model's answer and the first audio byte, on a path that is already
over budget — and it gains nothing, because the engine call it wraps is the same call.

**The agent keeps its own engine loop.** Rejected outright: two implementations of the state machine
is the one thing CLAUDE.md §5 forbids about this milestone.

**Merge coverage and phrasing into one call.** See decision 5.

**Token-stream the phrasing call into TTS.** Tempting — it would cut several hundred milliseconds.
Rejected for now because the asks guard counts the asks in the *whole* text before anything is
spoken (`interview/asks.py`), and a half-spoken turn cannot be retracted. Revisit if the measured
budget still fails after levers 1–4.

**The bundle in the room's metadata.** Rejected: participants can read room metadata, and the bundle
carries the probes.

**Dispatch metadata carrying the bundle.** Delivered to the agent rather than the room, so it is not
a leak — but it makes reconnection a re-dispatch problem and duplicates a shape the API can serve.
The pull is one route and survives a reconnect.

**Our own WebRTC/WebSocket media path instead of LiveKit.** Rejected: turn detection, barge-in,
reconnection, simulcast and a global edge are the whole value, and the stack decision already names
LiveKit (CLAUDE.md §2).

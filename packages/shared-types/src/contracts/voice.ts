import { z } from "zod";
import { INTERVIEW_LIMITS } from "../constants.js";
import { AiCallRecord } from "./cv.js";
import {
  InterviewEndReason,
  InterviewEngineSnapshot,
  InterviewSessionBundle,
  InterviewState,
  InterviewStatus,
  InterviewTurn,
} from "./interviews.js";

/**
 * Voice mode (spec §4.3, §8; M5, ADR-0019).
 *
 * ## Why this file exists at all
 *
 * In text mode the API initiates every exchange, so everything to be persisted rides the response
 * home (ADR-0016 §3). In voice there is no API request to answer: the candidate stops speaking and the
 * interviewer has to reply. So the LiveKit agent drives the **same** engine in-process and pushes what
 * happened to the API afterwards — the push direction ADR-0016 named and left open.
 *
 * Three routes, all internal and all behind the service token (`/api/internal/interviews/:id/...`):
 *
 * 1. `GET .../voice-session` → `VoiceSessionStartResponse`. Everything the agent needs to run the
 *    leg, pulled rather than pushed, because **the dispatch carries only the session id**: room
 *    metadata is readable by participants and the bundle carries `planned_follow_ups`, which are
 *    answer key (ADR-0019 §4).
 * 2. `POST .../turns` ← `InterviewTurnPush`. One completed exchange, persisted through the same
 *    `applyExchange` text mode uses, idempotent by `(session_id, seq)` with `exchange_id` covering
 *    the rows that have no natural key. Sent **after** the interviewer starts speaking: a database
 *    write on the critical path is latency the candidate pays for nothing.
 * 3. `POST .../voice-ended` ← `VoiceLegEndedRequest`. The leg is over — finished, fallen back to
 *    text, or lost — and this is what writes the voice minutes to `usage_ledger`.
 *
 * ## `.meta({ id })`
 *
 * Same rule as the rest (ADR-0003): a schema a controller uses as a DTO root carries no root id,
 * because nestjs-zod would emit two OpenAPI components with the same name. Nested building blocks do.
 */

// -----------------------------------------------------------------------------------------------
// The vocabulary.

/**
 * Why the **voice leg** ended, which is not why the interview ended. An interview that falls back to
 * text carries on at the same turn; a candidate who closes the tab has abandoned a session the sweep
 * will find. Only `completed` means the engine reached `ended` while the agent was still there.
 *
 * `allowance_exhausted` was added at phase 3, when the agent turned out to need a word for it. The
 * agent is told how many voice seconds the session has left (`voice_seconds_remaining`) and closes
 * the leg **before** crossing that line rather than discovering it in the ledger afterwards — and
 * what that is is neither an error nor a poor connection. The candidate carries on in text mode, so
 * the reason has to be legible in the analytics that ask how often that happens.
 */
export const VoiceLegEndReason = z
  .enum([
    "completed",
    "fallback_poor_connection",
    "candidate_left",
    "agent_error",
    "session_expired",
    "allowance_exhausted",
  ])
  .meta({ id: "VoiceLegEndReason" });
export type VoiceLegEndReason = z.infer<typeof VoiceLegEndReason>;

/**
 * Where one turn's time went (ADR-0019 §5). Milliseconds, all measured from the moment the candidate
 * stopped speaking, so the stages add up against one reference rather than against each other.
 *
 * The two figures the target is about are `acknowledged_ms` — the pre-rendered acknowledgement, which
 * is the first audio the candidate hears — and `response_ms`, the question or probe that answers them.
 * `VOICE_LIMITS.firstAudioTargetMs` and `responseTargetMs` are what they are read against.
 *
 * Several stages are legitimately null, and which ones tells you what the engine did: no
 * `coverage_ms` means `probes_to_judge` said there was nothing left to judge; no `phrasing_ms` means
 * the opening was prefetched during the previous answer or the pinned wording was used; no
 * `tts_first_byte_ms` means the audio was already rendered.
 */
export const VoiceTurnLatency = z
  .object({
    /** The interviewer turn this reply became, so a sample joins its own line of the transcript. */
    turn_seq: z.int().min(0),
    speech_ended_at: z.iso.datetime(),
    /**
     * Voice activity ending → the turn detector committing. The largest fixed cost in the budget and
     * the one that is a product trade-off rather than an engineering one: shorter interrupts a
     * candidate who is still thinking.
     */
    endpoint_ms: z.int().min(0),
    stt_final_ms: z.int().min(0),
    /** First audio of the pinned acknowledgement. Null if none was played. */
    acknowledged_ms: z.int().min(0).nullable(),
    coverage_ms: z.int().min(0).nullable(),
    phrasing_ms: z.int().min(0).nullable(),
    tts_first_byte_ms: z.int().min(0).nullable(),
    /** First audio byte of the question or probe itself: the number spec §8 is really about. */
    response_ms: z.int().min(0),
    /** The opening was phrased and synthesized during the previous answer (lever 2). */
    prefetched: z.boolean(),
    /** The coverage call was fired on an interim transcript (lever 3; off unless phase 8 asks). */
    interim_coverage: z.boolean(),
    /** The candidate spoke over this turn. */
    interrupted: z.boolean(),
  })
  .meta({ id: "VoiceTurnLatency" });
export type VoiceTurnLatency = z.infer<typeof VoiceTurnLatency>;

/**
 * What the connection was like over the leg, as the agent saw it. Kept as a summary rather than a
 * series: it exists to explain a fallback and to tell one carrier from another in phase 8, not to
 * draw a graph. Nullable throughout because a leg that failed on the first second has no p95.
 */
export const VoiceQuality = z
  .object({
    rtt_ms_p50: z.int().min(0).nullable(),
    rtt_ms_p95: z.int().min(0).nullable(),
    packet_loss_percent: z.number().min(0).max(100).nullable(),
    reconnects: z.int().min(0),
  })
  .meta({ id: "VoiceQuality" });
export type VoiceQuality = z.infer<typeof VoiceQuality>;

// -----------------------------------------------------------------------------------------------
// Browser ↔ API.

/**
 * `POST /api/interviews/{id}/voice-token` — what the browser needs to join, and nothing else.
 *
 * Refused before anything is issued, each with its own `ApiError` code the web app maps to copy
 * (ADR-0012): `interview_not_found` (not this candidate's), `interview_ended`, `interview_expired`,
 * `voice_not_enabled` (a text session stays a text session), `voice_consent_required`
 * (`audio_processing` not granted at the current version), `voice_allowance_exhausted`, and
 * `voice_unavailable` when the deployment has no LiveKit configured at all.
 *
 * The token authorises **joining**, for `VOICE_LIMITS.tokenTtlSeconds`. It is not the session's
 * length: `ends_at` on the session is the wall-clock deadline and the engine enforces it.
 */
export const VoiceTokenResponse = z.object({
  /** The LiveKit server the browser connects to. */
  url: z.url().max(300),
  token: z.string().min(1).max(4_000),
  room: z.string().min(1).max(120),
  /** Who the candidate is inside the room — an opaque id, never a name or an email. */
  identity: z.string().min(1).max(80),
  expires_at: z.iso.datetime(),
  /**
   * How long the connection may stay poor before the browser gives up and falls back to text. Sent
   * rather than hardcoded in the client so the threshold has one source, and so phase 8 can move it
   * without shipping a new bundle.
   */
  fallback_after_poor_ms: z.int().min(1_000).max(120_000),
});
export type VoiceTokenResponse = z.infer<typeof VoiceTokenResponse>;

// -----------------------------------------------------------------------------------------------
// Worker (the LiveKit agent) → API. Internal, service token.

/**
 * `GET /api/internal/interviews/{id}/voice-session` — everything the agent needs to run this leg.
 *
 * `resume` is true when the session has already been advanced, which is a reconnection or a second
 * leg after a fallback; the agent then speaks nothing new and waits for the candidate.
 *
 * **`now` is the API's clock.** In text mode `now` travels on every request, which makes an exchange
 * a pure function of it (ADR-0016). The agent has to supply its own per turn — it is the one driving —
 * so it is given the API's clock once and logs the skew. `ends_at` is absolute, so skew only matters
 * at the very margin of a budget.
 */
export const VoiceSessionStartResponse = z.object({
  bundle: InterviewSessionBundle,
  /** Null only on a session that has never been advanced: the agent then speaks the intro. */
  engine_snapshot: InterviewEngineSnapshot.nullable(),
  resume: z.boolean(),
  room: z.string().min(1).max(120),
  ends_at: z.iso.datetime(),
  now: z.iso.datetime(),
  /**
   * The allowance left when the token was issued, so the agent can close the leg before it is
   * exceeded rather than discovering it afterwards. The ledger is the record; this is the budget.
   */
  voice_seconds_remaining: z.int().min(0),
});
export type VoiceSessionStartResponse = z.infer<typeof VoiceSessionStartResponse>;

/**
 * `POST /api/internal/interviews/{id}/turns` — one completed exchange.
 *
 * Deliberately close to `InterviewAdvanceResponse`, because it is the same thing arriving by the
 * other door, with two differences. There is no `error` field: a refused exchange produces no push,
 * exactly as it produces no turns. And `engine_snapshot` is **not** nullable, for the same reason —
 * a push means the exchange completed.
 *
 * `exchange_id` is the agent's own idempotency key, stable across retries of the same push. The turns
 * are already idempotent by `(session_id, seq)`; the ai-call and latency rows have no natural key, so
 * this is what stops a retried push billing twice.
 */
export const InterviewTurnPush = z.object({
  exchange_id: z.uuid(),
  state: InterviewState,
  ended: z.boolean(),
  end_reason: InterviewEndReason.nullable(),
  turns: z.array(InterviewTurn).min(1),
  engine_snapshot: InterviewEngineSnapshot,
  prompt_versions: z.record(z.string(), z.int()),
  ai_calls: z.array(AiCallRecord),
  /** One per interviewer reply in this exchange. Empty is legitimate: an exchange may only listen. */
  latency: z.array(VoiceTurnLatency),
});
export type InterviewTurnPush = z.infer<typeof InterviewTurnPush>;

/**
 * What the API says back. `duplicate` means this `exchange_id` had already been applied — the
 * expected answer to a retry, and not an error: the agent logs it and carries on.
 */
export const InterviewTurnPushResponse = z.object({
  state: InterviewState,
  status: InterviewStatus,
  ended: z.boolean(),
  duplicate: z.boolean(),
});
export type InterviewTurnPushResponse = z.infer<typeof InterviewTurnPushResponse>;

/**
 * `POST /api/internal/interviews/{id}/voice-ended` — the leg is over, and this is what meters it.
 *
 * `voice_seconds` is what goes to `usage_ledger` (allowance metering only, never cost — ADR-0007),
 * rounded up, and it is sent whether the leg ended well or badly: minutes spent on a call that then
 * fell over are still minutes. `leg_id` makes that write idempotent.
 */
export const VoiceLegEndedRequest = z.object({
  leg_id: z.uuid(),
  reason: VoiceLegEndReason,
  voice_seconds: z.int().min(0),
  turns_spoken: z.int().min(0),
  quality: VoiceQuality,
});
export type VoiceLegEndedRequest = z.infer<typeof VoiceLegEndedRequest>;

export const VoiceLegEndedResponse = z.object({
  /** This `leg_id` had already been recorded; nothing was metered twice. */
  duplicate: z.boolean(),
  /** Everything this session has been metered for, after this request. */
  voice_seconds_total: z.int().min(0),
});
export type VoiceLegEndedResponse = z.infer<typeof VoiceLegEndedResponse>;

// -----------------------------------------------------------------------------------------------
// API → admin. The latency view (M5 phase 4), and what the pilot and phase 8 read.

/**
 * One stage of one turn, spread over however many turns were sampled.
 *
 * **p50 and p95 are null rather than 0 when nothing was sampled**, because a stage that did not
 * happen and a stage that happened instantly are different facts — and most stages legitimately do
 * not happen: `coverage_ms` is null when there was nothing left to judge, `phrasing_ms` when the
 * opening was prefetched, `tts_first_byte_ms` when the audio was already rendered. A zero there
 * would read as "we are fast" when it means "we did not do it".
 *
 * `n` is the number of turns that had a figure for this stage, not the number of turns — so the
 * sample size is on the face of every stage, which is the rule the pace report already follows.
 */
export const VoiceLatencySpread = z
  .object({
    n: z.int().min(0),
    p50_ms: z.int().min(0).nullable(),
    p95_ms: z.int().min(0).nullable(),
  })
  .meta({ id: "VoiceLatencySpread" });
export type VoiceLatencySpread = z.infer<typeof VoiceLatencySpread>;

/**
 * Every stage, over a set of turns. `first_audio` and `response` are the two numbers ADR-0019 §5
 * replaced spec §8's single "~1 s" with, and the rest are what explain them.
 */
export const VoiceLatencySummary = z
  .object({
    turns: z.int().min(0),
    /** The pinned acknowledgement: the first thing the candidate hears (`VOICE_LIMITS.firstAudioTargetMs`). */
    first_audio: VoiceLatencySpread,
    /** The question or probe itself (`VOICE_LIMITS.responseTargetMs`). */
    response: VoiceLatencySpread,
    endpoint: VoiceLatencySpread,
    stt_final: VoiceLatencySpread,
    coverage: VoiceLatencySpread,
    phrasing: VoiceLatencySpread,
    tts_first_byte: VoiceLatencySpread,
    /** Turns whose opening was phrased and rendered during the previous answer (lever 2). */
    prefetched: z.int().min(0),
    /** Turns the candidate spoke over. Barge-in is allowed; this is how often it happens. */
    interrupted: z.int().min(0),
  })
  .meta({ id: "VoiceLatencySummary" });
export type VoiceLatencySummary = z.infer<typeof VoiceLatencySummary>;

/**
 * One leg as the ledger recorded it. A session has one leg if nothing went wrong and several if the
 * candidate reconnected, so `reason` on the last of them is what says how voice ended for them.
 */
export const VoiceLegRecord = z
  .object({
    leg_id: z.uuid(),
    reason: VoiceLegEndReason,
    voice_seconds: z.int().min(0),
    turns_spoken: z.int().min(0),
    quality: VoiceQuality,
    ended_at: z.iso.datetime(),
  })
  .meta({ id: "VoiceLegRecord" });
export type VoiceLegRecord = z.infer<typeof VoiceLegRecord>;

/**
 * One voice session in the admin list. **No candidate, by construction** — not their name, their
 * email or their id: this view exists to read a number against a target, and who was interviewed
 * is not part of that question (the calibration dashboard's rule, ADR-0017, applied again).
 */
export const VoiceLatencySession = z
  .object({
    session_id: z.uuid(),
    started_at: z.iso.datetime(),
    ended_at: z.iso.datetime().nullable(),
    status: InterviewStatus,
    state: InterviewState,
    /** Everything `usage_ledger` has metered for this session, across every leg. */
    voice_seconds: z.int().min(0),
    /** True when a leg ended as `fallback_poor_connection`: the bookkeeping, not an analytics event. */
    fell_back_to_text: z.boolean(),
    legs: z.array(VoiceLegRecord),
    latency: VoiceLatencySummary,
  })
  .meta({ id: "VoiceLatencySession" });
export type VoiceLatencySession = z.infer<typeof VoiceLatencySession>;

/** The two targets, served rather than hardcoded in the page, so one number is read everywhere. */
export const VoiceLatencyTargets = z
  .object({
    first_audio_ms: z.int().min(0),
    response_ms: z.int().min(0),
  })
  .meta({ id: "VoiceLatencyTargets" });
export type VoiceLatencyTargets = z.infer<typeof VoiceLatencyTargets>;

/** `GET /api/admin/voice/latency?cursor=&limit=` — newest voice sessions, keyset-paged. */
export const VoiceLatencyQuery = z.object({
  cursor: z.string().min(1).max(INTERVIEW_LIMITS.cursorMaxLength).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(INTERVIEW_LIMITS.pageSize.max)
    .default(INTERVIEW_LIMITS.pageSize.default),
});
export type VoiceLatencyQuery = z.infer<typeof VoiceLatencyQuery>;

/**
 * `GET /api/admin/voice/latency` — the whole measurement, and each session behind it.
 *
 * `overall` is computed over the turns of **the sessions on this page**, which is why the page says
 * so: an aggregate whose denominator moves with the pager would otherwise be read as the figure for
 * the deployment. Phase 8's table is the figure for the deployment, and it says its sample size.
 */
export const VoiceLatencyResponse = z.object({
  overall: VoiceLatencySummary,
  targets: VoiceLatencyTargets,
  sessions: z.array(VoiceLatencySession),
  next_cursor: z.string().min(1).max(INTERVIEW_LIMITS.cursorMaxLength).nullable(),
});
export type VoiceLatencyResponse = z.infer<typeof VoiceLatencyResponse>;

/**
 * `GET /api/admin/voice/latency/{id}` — one session, turn by turn.
 *
 * The per-turn rows are what a p50 is made of, and phase 8's verdict on the budget is read off
 * them: a summary can say the response target is missed and only the rows can say whether it is the
 * coverage call, the phrasing call or the synthesizer.
 */
export const VoiceSessionLatencyResponse = z.object({
  session: VoiceLatencySession,
  targets: VoiceLatencyTargets,
  turns: z.array(VoiceTurnLatency),
});
export type VoiceSessionLatencyResponse = z.infer<typeof VoiceSessionLatencyResponse>;

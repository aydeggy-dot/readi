/**
 * What the API needs of a real-time media server, and nothing more (ADR-0019).
 *
 * Two operations, and the interface exists for the same reason every provider interface in this repo
 * does: so the rule about what may enter a room is testable without one. `voice-no-answer-key`'s half
 * of `content-no-answer-key.int.spec.ts` drives a recording double and reads back **every payload the
 * API handed the server** — the join token's own claims, the room's metadata, the dispatch's metadata
 * — and asserts the answer key is in none of them.
 */

/** A join token, and where to spend it. */
export interface RoomJoin {
  url: string;
  token: string;
  room: string;
  identity: string;
  expiresAt: Date;
}

export interface JoinRequest {
  room: string;
  /** Opaque, and never a name, an email or a user id: see `roomFor`/`identityFor` in the service. */
  identity: string;
  ttlSeconds: number;
}

export interface DispatchRequest {
  room: string;
  /**
   * **The only thing the dispatch carries** (ADR-0019 §4). The bundle holds `planned_follow_ups`,
   * which are answer key, and dispatch metadata is delivered to the agent rather than to the room —
   * but a reconnection would then be a re-dispatch problem and the shape would exist twice. So the
   * agent is told which session it is and pulls the rest over the service-token channel.
   */
  sessionId: string;
}

export interface VoiceRoom {
  /** A token that authorises **joining**, for as long as it is given. Not the session's length. */
  join(request: JoinRequest): Promise<RoomJoin>;
  /**
   * Put the interviewer in the room, unless it is already on its way.
   *
   * Idempotent on purpose: a candidate who reloads the page asks for a second token, and two agents
   * in one room would interview them twice at once. Explicit dispatch is what makes the check
   * possible — a named agent joins no room it was not sent to, so the dispatches for a room are the
   * whole truth about who is coming.
   */
  dispatch(request: DispatchRequest): Promise<void>;
}

/** DI token: the module binds either LiveKit or the "voice is off here" refusal (`voice.module.ts`). */
export const VOICE_ROOM = Symbol("VOICE_ROOM");

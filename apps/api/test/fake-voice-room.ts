import type { DispatchRequest, JoinRequest, RoomJoin, VoiceRoom } from "../src/voice/voice-room";

/**
 * A LiveKit that records instead of connecting — and, more to the point, **keeps every payload the API
 * handed it**.
 *
 * That is what lets `content-no-answer-key.int.spec.ts` assert ADR-0019 §4 as a test rather than as a
 * convention: room metadata and data channels are readable by participants, so a probe that reached
 * either of them would be the answer key in the candidate's own browser. The rule is that the dispatch
 * carries the session id and nothing else, and `payloads` is where that is checked.
 *
 * The token is not a real JWT. It does not need to be: what is under test here is what we put *into*
 * the room, and a real signature would only prove that `jose` works. What a real token would add is a
 * hidden claim — which is why `join` records the whole request rather than the token.
 */
export class FakeVoiceRoom implements VoiceRoom {
  readonly joins: JoinRequest[] = [];
  readonly dispatches: DispatchRequest[] = [];

  join(request: JoinRequest): Promise<RoomJoin> {
    this.joins.push(request);
    return Promise.resolve({
      url: "ws://127.0.0.1:7880",
      token: `fake-token-for-${request.identity}`,
      room: request.room,
      identity: request.identity,
      expiresAt: new Date(Date.now() + request.ttlSeconds * 1_000),
    });
  }

  dispatch(request: DispatchRequest): Promise<void> {
    this.dispatches.push(request);
    return Promise.resolve();
  }

  /**
   * Everything that would have entered the room or reached the agent through it, as one value to run
   * the answer-key detector over. A new field on either request shows up here without anybody
   * remembering to add it, which is the only way this check keeps working.
   */
  payloads(): unknown {
    return { joins: this.joins, dispatches: this.dispatches };
  }

  reset(): void {
    this.joins.length = 0;
    this.dispatches.length = 0;
  }
}

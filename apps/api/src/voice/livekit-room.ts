import { HttpStatus, Logger } from "@nestjs/common";
import { TrackSource } from "@livekit/protocol";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { ApiError } from "../http/api-error";
import type { DispatchRequest, JoinRequest, RoomJoin, VoiceRoom } from "./voice-room";

/**
 * LiveKit Cloud in production, `livekit-server --dev` in docker compose locally (ADR-0001).
 *
 * The **only** new dependency this phase adds is `livekit-server-sdk`, and it is here rather than
 * hand-rolled because both halves of it are details we would get wrong once: the exact shape of a
 * video grant, and the Twirp envelope of the agent-dispatch API. It carries `jose` and two protobuf
 * packages, no install-time build script, and it is LiveKit's own — the stack decision already names
 * them (CLAUDE.md §2).
 */
/**
 * The part of `AgentDispatchClient` this uses.
 *
 * Narrow on purpose, and injectable: the "is an interviewer already coming?" rule is the one thing here
 * worth a test, and testing it through the real client would mean a LiveKit server. Two methods is also
 * a useful bound on how much of a vendor's SDK this class depends on.
 */
export interface AgentDispatcher {
  listDispatch(room: string): Promise<unknown[]>;
  createDispatch(room: string, agentName: string, options: { metadata: string }): Promise<unknown>;
}

export class LiveKitRoom implements VoiceRoom {
  private readonly logger = new Logger(LiveKitRoom.name);
  private readonly dispatcher: AgentDispatcher;

  constructor(
    private readonly config: {
      url: string;
      apiKey: string;
      apiSecret: string;
      agentName: string;
    },
    dispatcher?: AgentDispatcher,
  ) {
    this.dispatcher =
      dispatcher ?? new AgentDispatchClient(httpBase(config.url), config.apiKey, config.apiSecret);
  }

  async join(request: JoinRequest): Promise<RoomJoin> {
    const issuedAt = Date.now();
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: request.identity,
      ttl: request.ttlSeconds,
      /*
       * No `name`, no `metadata`, no `attributes`. All three are readable by every participant in the
       * room, and every one of them is a place a candidate's name could end up by accident — the
       * identity is deliberately derived from the session rather than from the user (`voice.service`).
       */
    });
    token.addGrant({
      room: request.room,
      roomJoin: true,
      /*
       * A microphone and nothing else. `canPublishData` is off because the browser has no reason to
       * send the agent anything — the engine is driven by the API, and a data channel the candidate
       * can write to is a channel somebody could try to drive the interview down. Subscribing is how
       * they hear the interviewer; `canPublishSources` narrows publishing to audio, so a token
       * captured from a log cannot turn a camera on.
       */
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
      /*
       * The room's own metadata may not be written from a join token (`canUpdateOwnMetadata` off):
       * participants can read it, and it is one of the two places ADR-0019 §4 keeps the bundle out of.
       */
      canUpdateOwnMetadata: false,
    });
    return {
      url: this.config.url,
      token: await token.toJwt(),
      room: request.room,
      identity: request.identity,
      expiresAt: new Date(issuedAt + request.ttlSeconds * 1_000),
    };
  }

  async dispatch(request: DispatchRequest): Promise<void> {
    try {
      const existing = await this.dispatcher.listDispatch(request.room);
      if (existing.length > 0) {
        // A reload, or a second tab. One interviewer per room: two would ask two questions at once.
        this.logger.log(`interview ${request.sessionId}: an interviewer is already dispatched`);
        return;
      }
      await this.dispatcher.createDispatch(request.room, this.config.agentName, {
        // The session id and nothing else (ADR-0019 §4). Serialised here rather than by the caller so
        // there is one place that decides what a dispatch is allowed to say.
        metadata: JSON.stringify({ session_id: request.sessionId }),
      });
    } catch (error) {
      /*
       * A 503 with its own code, not a 500: the candidate's session is intact and text mode is right
       * there, so the web app offers it rather than showing a failure (ADR-0012). The message names
       * the error's *type* — LiveKit's own error bodies can quote a room name, and a room name here is
       * derived from a session id.
       */
      this.logger.error(
        `interview ${request.sessionId}: could not dispatch the interviewer ` +
          `(${error instanceof Error ? error.name : "error"})`,
      );
      throw new ApiError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "voice_unavailable",
        "the voice interviewer could not be reached",
      );
    }
  }
}

/**
 * The server API's base, from the URL the browser uses.
 *
 * One configured value rather than two, because they are one server and a deployment with two copies
 * of its address has two things to get wrong. `ws://` → `http://`, `wss://` → `https://`; anything
 * else is already an http base and is passed through.
 */
export function httpBase(url: string): string {
  return url.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:");
}

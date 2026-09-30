import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../http/api-error";
import { type AgentDispatcher, LiveKitRoom } from "./livekit-room";

const CONFIG = {
  url: "ws://127.0.0.1:7880",
  apiKey: "devkey",
  apiSecret: "secret",
  agentName: "readi-interviewer",
};
const SESSION = "6f1e0f4a-0000-4000-8000-000000000001";

function roomWith(dispatcher: Partial<AgentDispatcher>): {
  room: LiveKitRoom;
  listDispatch: ReturnType<typeof vi.fn>;
  createDispatch: ReturnType<typeof vi.fn>;
} {
  const listDispatch = vi.fn(dispatcher.listDispatch ?? (() => Promise.resolve([])));
  const createDispatch = vi.fn(dispatcher.createDispatch ?? (() => Promise.resolve({})));
  return {
    room: new LiveKitRoom(CONFIG, { listDispatch, createDispatch }),
    listDispatch,
    createDispatch,
  };
}

describe("putting the interviewer in the room", () => {
  it("dispatches the named agent with the session id, and nothing else", async () => {
    const { room, createDispatch } = roomWith({});
    await room.dispatch({ room: "interview-x", sessionId: SESSION });
    expect(createDispatch).toHaveBeenCalledWith("interview-x", "readi-interviewer", {
      metadata: JSON.stringify({ session_id: SESSION }),
    });
    // The whole metadata, parsed back: one key, so a second one has to be argued for (ADR-0019 §4).
    const metadata = createDispatch.mock.calls[0]?.[2] as { metadata: string };
    expect(Object.keys(JSON.parse(metadata.metadata) as object)).toEqual(["session_id"]);
  });

  /**
   * A candidate who reloads asks for a second token, and two interviewers in one room would interview
   * them twice at once. Explicit dispatch is what makes the check possible: a **named** agent joins no
   * room it was not sent to, so the dispatches for a room are the whole truth about who is coming.
   */
  it("does not send a second interviewer when one is already coming", async () => {
    const { room, createDispatch } = roomWith({ listDispatch: () => Promise.resolve([{}]) });
    await room.dispatch({ room: "interview-x", sessionId: SESSION });
    expect(createDispatch).not.toHaveBeenCalled();
  });

  it("asks before it creates, so the order is not an accident", async () => {
    const order: string[] = [];
    const { room } = roomWith({
      listDispatch: () => {
        order.push("list");
        return Promise.resolve([]);
      },
      createDispatch: () => {
        order.push("create");
        return Promise.resolve({});
      },
    });
    await room.dispatch({ room: "interview-x", sessionId: SESSION });
    expect(order).toEqual(["list", "create"]);
  });

  /**
   * A 503 with its own code rather than a 500: the candidate's session is intact and text mode is
   * right there, so the web app offers it instead of showing a failure (ADR-0012). The message names
   * the error's *type* only — LiveKit's own error bodies can quote a room name, and a room name here is
   * derived from a session id.
   */
  it("turns a LiveKit failure into voice_unavailable", async () => {
    const { room } = roomWith({
      listDispatch: () => Promise.reject(new Error("livekit is down")),
    });
    await expect(room.dispatch({ room: "interview-x", sessionId: SESSION })).rejects.toThrow(
      ApiError,
    );
    await expect(
      room.dispatch({ room: "interview-x", sessionId: SESSION }).catch((error: unknown) => {
        const body = (error as ApiError).getResponse() as { code: string; message: string };
        return body;
      }),
    ).resolves.toMatchObject({ code: "voice_unavailable" });
  });
});

describe("the join token", () => {
  it("authorises a microphone in one room, and nothing else", async () => {
    const { room } = roomWith({});
    const join = await room.join({ room: "interview-x", identity: "candidate-x", ttlSeconds: 300 });
    expect(join.room).toBe("interview-x");
    expect(join.identity).toBe("candidate-x");
    expect(join.url).toBe(CONFIG.url);
    // A real JWT, signed with the configured secret: three dot-separated segments.
    expect(join.token.split(".")).toHaveLength(3);
    const ttl = (join.expiresAt.getTime() - Date.now()) / 1_000;
    expect(ttl).toBeGreaterThan(290);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  /**
   * Nothing about the candidate travels in the token beyond the identity the caller chose, which is
   * derived from the session. `name`, `metadata` and `attributes` are all readable by every participant
   * in the room, so none of them is set — and this asserts it from the payload rather than from the
   * absence of three lines of code.
   */
  it("carries no participant name, metadata or attributes", async () => {
    const { room } = roomWith({});
    const join = await room.join({ room: "interview-x", identity: "candidate-x", ttlSeconds: 300 });
    const payload = JSON.parse(
      Buffer.from(join.token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as Record<string, unknown> & { video?: Record<string, unknown> };
    expect(payload.name).toBeUndefined();
    expect(payload.metadata).toBeUndefined();
    expect(payload.attributes).toBeUndefined();
    expect(payload.sub).toBe("candidate-x");
    expect(payload.video).toMatchObject({
      room: "interview-x",
      roomJoin: true,
      canSubscribe: true,
      // No data channel the candidate can write to, and no camera: publishing is audio alone
      // (product principle 4 — camera coaching is opt-in and on-device).
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: ["microphone"],
    });
  });
});

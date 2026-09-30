import { describe, expect, it } from "vitest";
import { httpBase } from "./livekit-room";
import { identityFor, roomFor } from "./voice.service";

describe("the LiveKit server base", () => {
  /**
   * One configured address rather than two. A deployment with two copies of its LiveKit URL has two
   * things to get wrong, and the one that is wrong is always the one nobody tests.
   */
  it("derives the server API's base from the URL the browser uses", () => {
    expect(httpBase("ws://127.0.0.1:7880")).toBe("http://127.0.0.1:7880");
    expect(httpBase("wss://readi.livekit.cloud")).toBe("https://readi.livekit.cloud");
  });

  it("leaves an http base alone, so a misconfiguration is not silently rewritten", () => {
    expect(httpBase("https://readi.livekit.cloud")).toBe("https://readi.livekit.cloud");
  });
});

describe("what a room is called", () => {
  const session = "6f1e0f4a-0000-4000-8000-000000000001";
  const user = "6f1e0f4a-0000-4000-8000-0000000000ff";

  /**
   * Both are derived from the **session**, and that is a privacy decision rather than a convenience.
   * A room name and a participant identity are visible to everybody in the room and appear in
   * LiveKit's own logs and dashboards: a session id leads nowhere without our database, while a user
   * id would link every room that candidate has ever been in.
   */
  it("names a room and an identity after the session, never after the candidate", () => {
    expect(roomFor(session)).toContain(session);
    expect(identityFor(session)).toContain(session);
    expect(roomFor(session)).not.toContain(user);
    expect(identityFor(session)).not.toContain(user);
  });

  /** Deterministic, which is what makes a reconnection free: the same room, the same interviewer. */
  it("gives the same session the same room every time", () => {
    expect(roomFor(session)).toBe(roomFor(session));
    expect(roomFor(session)).not.toBe(roomFor("6f1e0f4a-0000-4000-8000-000000000002"));
  });
});

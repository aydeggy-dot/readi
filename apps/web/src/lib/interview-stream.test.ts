import type { InterviewFrame } from "@readi/shared-types";
import { describe, expect, it } from "vitest";
import { advanceInterview, parseFrames } from "./interview-stream";

/** A stream that hands out the given chunks, so a frame can be split wherever a test wants. */
function streaming(chunks: readonly string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    ...init,
  });
}

const message = (frame: InterviewFrame) => `data: ${JSON.stringify(frame)}\n\n`;

const STATE: InterviewFrame = {
  type: "state",
  state: "question",
  status: "in_progress",
  ends_at: "2026-09-25T10:30:00.000Z",
  ended_at: null,
  questions_asked: 1,
  question_budget: 4,
};

describe("parseFrames", () => {
  it("returns the complete messages and keeps the unfinished one", () => {
    const whole = message({ type: "thinking" });
    const half = 'data: {"type":"do';
    const { frames, rest } = parseFrames(whole + half);
    expect(frames).toEqual([{ type: "thinking" }]);
    expect(rest).toBe(half);
  });

  it("ignores anything that is not a data message", () => {
    const { frames } = parseFrames(`: keep-alive\n\n${message({ type: "done" })}`);
    expect(frames).toEqual([{ type: "done" }]);
  });

  it("reads the data line of a message that has more than one line", () => {
    const { frames } = parseFrames(`: a comment\ndata: {"type":"done"}\n\n`);
    expect(frames).toEqual([{ type: "done" }]);
  });

  it("refuses a message that is not a frame", () => {
    expect(() => parseFrames("data: 12\n\n")).toThrow(/frame type/);
  });
});

describe("advanceInterview", () => {
  it("reports every frame, in order, even when one is split across two reads", async () => {
    const whole = message({ type: "thinking" }) + message(STATE) + message({ type: "done" });
    // Split inside the state frame's JSON: the exact bug a hand-written SSE client always has.
    const split = [whole.slice(0, 40), whole.slice(40, 120), whole.slice(120)];
    const frames: InterviewFrame[] = [];

    const outcome = await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "start" },
      {
        onFrame: (frame) => frames.push(frame),
        fetchImpl: () => Promise.resolve(streaming(split)),
      },
    );

    expect(outcome).toEqual({ kind: "ok" });
    expect(frames.map((frame) => frame.type)).toEqual(["thinking", "state", "done"]);
    expect(frames[1]).toEqual(STATE);
  });

  it("posts the action and the candidate's words to the session's advance route", async () => {
    let sent: { url: RequestInfo | URL; init?: RequestInit } | undefined;
    await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "answer", text: "I would add an index." },
      {
        onFrame: () => {},
        fetchImpl: (url, init) => {
          sent = { url, init };
          return Promise.resolve(streaming([message({ type: "done" })]));
        },
      },
    );

    expect(sent?.url).toBe("/api/interviews/3f1c9e4a-0000-4000-8000-000000000000/advance");
    expect(sent?.init?.method).toBe("POST");
    expect(sent?.init?.body).toBe(
      JSON.stringify({ action: "answer", text: "I would add an index." }),
    );
  });

  /*
   * The two halves of ADR-0016 decision 2. A refusal the API knew before the headers went out is an
   * HTTP error with a code; after that the status is already 200, so it is an `error` frame.
   */
  it("says nothing about a double-tapped send", async () => {
    const outcome = await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "answer", text: "again" },
      {
        onFrame: () => {},
        fetchImpl: () =>
          Promise.resolve(
            Response.json({ code: "interview_busy", message: "in flight" }, { status: 409 }),
          ),
      },
    );
    expect(outcome).toEqual({ kind: "busy" });
  });

  it("treats a finished or expired session as somewhere else to be, not an error to show", async () => {
    for (const code of ["interview_ended", "interview_expired"] as const) {
      const outcome = await advanceInterview(
        "3f1c9e4a-0000-4000-8000-000000000000",
        { action: "answer", text: "hello" },
        {
          onFrame: () => {},
          fetchImpl: () =>
            Promise.resolve(Response.json({ code, message: "over" }, { status: 409 })),
        },
      );
      expect(outcome).toEqual({ kind: "stale", code });
    }
  });

  it("turns an unknown refusal into copy the screen can show", async () => {
    const outcome = await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "start" },
      {
        onFrame: () => {},
        fetchImpl: () =>
          Promise.resolve(Response.json({ code: "interview_not_found" }, { status: 404 })),
      },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.failure.message).toMatch(/cannot find/i);
  });

  it("does not report a failure when the caller has gone away", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "start" },
      {
        onFrame: () => {},
        signal: controller.signal,
        fetchImpl: () => Promise.reject(new Error("aborted")),
      },
    );
    expect(outcome).toEqual({ kind: "aborted" });
  });

  it("reports a request that never reached the API as a network failure", async () => {
    const outcome = await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "start" },
      { onFrame: () => {}, fetchImpl: () => Promise.reject(new Error("offline")) },
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") expect(outcome.failure.signedOut).toBe(false);
  });

  it("says the session ended when the API says so, whatever the stream then carries", async () => {
    const frames: InterviewFrame[] = [];
    await advanceInterview(
      "3f1c9e4a-0000-4000-8000-000000000000",
      { action: "end" },
      {
        onFrame: (frame) => frames.push(frame),
        fetchImpl: () =>
          Promise.resolve(
            streaming([
              message({ type: "turn", turn: WRAP_UP }),
              message({ ...STATE, status: "completed", ended_at: "2026-09-25T10:20:00.000Z" }),
              message({ type: "done" }),
            ]),
          ),
      },
    );
    expect(frames).toHaveLength(3);
    const state = frames.find((frame) => frame.type === "state");
    expect(state?.status).toBe("completed");
  });
});

const WRAP_UP = {
  seq: 9,
  speaker: "interviewer",
  state: "wrap_up",
  question_position: null,
  text: "Thanks for your time.",
  at: "2026-09-25T10:20:00.000Z",
} as const;

import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { InterviewStream, whileThinking } from "./interview-sse";

/** Just enough of an Express response to see what was written, and in what order. */
function fakeResponse() {
  const chunks: string[] = [];
  const response = {
    headers: {} as Record<string, string>,
    statusCode: 0,
    writableEnded: false,
    destroyed: false,
    writeHead(status: number, headers: Record<string, string>) {
      response.statusCode = status;
      Object.assign(response.headers, headers);
      return response;
    },
    flushHeaders: vi.fn(),
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    end() {
      response.writableEnded = true;
    },
  };
  return { response, chunks };
}

function stream() {
  const { response, chunks } = fakeResponse();
  return { stream: new InterviewStream(response as unknown as Response), response, chunks };
}

/** The frames a client would parse out of what was written. */
function framesFrom(chunks: string[]): unknown[] {
  return chunks
    .join("")
    .split("\n\n")
    .filter((message) => message.startsWith("data:"))
    .map((message) => JSON.parse(message.slice("data:".length)) as unknown);
}

describe("InterviewStream", () => {
  it("sends the headers a stream needs to reach a browser unbuffered", () => {
    const { stream: sse, response } = stream();
    sse.open();
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream; charset=utf-8");
    // `no-transform` matters as much as `no-cache`: a proxy that gzipped this would buffer it.
    expect(response.headers["cache-control"]).toContain("no-transform");
    expect(response.headers["x-accel-buffering"]).toBe("no");
    expect(response.flushHeaders).toHaveBeenCalled();
  });

  it("writes one SSE message per frame", () => {
    const { stream: sse, chunks } = stream();
    sse.open();
    sse.send({ type: "thinking" });
    sse.send({ type: "done" });
    expect(chunks).toEqual(['data: {"type":"thinking"}\n\n', 'data: {"type":"done"}\n\n']);
  });

  it("validates frames on the way out, so a shape drift fails here", () => {
    const { stream: sse } = stream();
    sse.open();
    expect(() =>
      // @ts-expect-error — the point of the test: a frame the contract does not know.
      sse.send({ type: "progress", percent: 40 }),
    ).toThrow();
  });

  it("writes nothing before it is opened or after it is closed", () => {
    const { stream: sse, chunks } = stream();
    sse.send({ type: "thinking" });
    expect(chunks).toEqual([]);
    sse.open();
    sse.close();
    sse.send({ type: "thinking" });
    expect(chunks).toEqual([]);
  });

  it("knows when the candidate has gone away", () => {
    const { stream: sse, response } = stream();
    sse.open();
    expect(sse.gone).toBe(false);
    response.destroyed = true;
    expect(sse.gone).toBe(true);
  });
});

describe("whileThinking", () => {
  it("says the interviewer is composing before the work starts", async () => {
    const { stream: sse, chunks } = stream();
    sse.open();
    const order: string[] = [];
    await whileThinking(sse, 10_000, () => {
      order.push(`worker called after ${framesFrom(chunks).length} frame(s)`);
      return Promise.resolve("done");
    });
    expect(order).toEqual(["worker called after 1 frame(s)"]);
    expect(framesFrom(chunks)).toEqual([{ type: "thinking" }]);
  });

  it("repeats while the work runs, so nothing drops an idle connection", async () => {
    vi.useFakeTimers();
    const { stream: sse, chunks } = stream();
    sse.open();
    try {
      let finish = (): void => {};
      const work = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const running = whileThinking(sse, 1_000, () => work);
      await vi.advanceTimersByTimeAsync(3_500);
      finish();
      await running;
      // One up front, then one a second.
      expect(framesFrom(chunks)).toHaveLength(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops the heartbeat when the work fails, not only when it succeeds", async () => {
    vi.useFakeTimers();
    const { stream: sse, chunks } = stream();
    sse.open();
    try {
      await expect(
        whileThinking(sse, 1_000, () => Promise.reject(new Error("worker gone"))),
      ).rejects.toThrow("worker gone");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(framesFrom(chunks)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns what the work returned", async () => {
    const { stream: sse } = stream();
    sse.open();
    await expect(whileThinking(sse, 10_000, () => Promise.resolve(42))).resolves.toBe(42);
  });
});

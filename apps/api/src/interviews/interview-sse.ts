import { InterviewFrame } from "@readi/shared-types";
import type { Response } from "express";

/**
 * The interview stream: whole-turn frames from the API to the browser (ADR-0016).
 *
 * Written by hand rather than with Nest's `@Sse()`, for two reasons. The route is a **POST** with a
 * body and a session cookie, which `@Sse()` is not built for; and the heartbeat below has to
 * interleave with an `await` on the worker, which needs control of when bytes are written rather
 * than an Observable that Nest subscribes to.
 *
 * Every frame is `data: <json>` with a `type` discriminator, one SSE message each. Not SSE `event:`
 * names: the browser cannot use `EventSource` here (it has no POST and no body), so the client reads
 * the stream with `fetch` and a `ReadableStream` reader — and parsing one JSON object per message is
 * less client code than parsing SSE's own field syntax. `scripts/sse-rewrite-proof.mjs` is the proof
 * that this survives `proxy.ts` and the Next rewrite under `next start` without being buffered.
 */
export class InterviewStream {
  private opened = false;
  private closed = false;

  constructor(private readonly response: Response) {}

  /**
   * Sends the headers. **Nothing may throw after this**: the status line is already 200, so an
   * exception reaching Nest's filter would try to write headers twice. Everything the service can
   * refuse is refused before this is called, and everything after it becomes an `error` frame.
   */
  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      // `no-transform` matters as much as `no-cache`: a proxy that gzips this would buffer it.
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // nginx buffers proxied responses by default and this is how it is told not to.
      "x-accel-buffering": "no",
    });
    this.response.flushHeaders();
  }

  /** One frame, validated on the way out so a shape drift fails here rather than in the browser. */
  send(frame: InterviewFrame): void {
    if (this.closed || !this.opened || this.response.writableEnded) return;
    this.response.write(`data: ${JSON.stringify(InterviewFrame.parse(frame))}\n\n`);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.opened && !this.response.writableEnded) this.response.end();
  }

  /** Whether the candidate has gone away — closed the tab, or lost the connection. */
  get gone(): boolean {
    return this.response.writableEnded || this.response.destroyed;
  }
}

/**
 * Runs `work` while telling the screen the interviewer is composing.
 *
 * The first frame goes out before the worker is called, which is the whole reason this is a stream:
 * the candidate sees the interviewer thinking the instant they press send, rather than a dead screen
 * for however long two model calls take. The repeats after it are a heartbeat — a connection with
 * nothing on it for ninety seconds is one that something in between may decide to close.
 */
export async function whileThinking<T>(
  stream: InterviewStream,
  everyMs: number,
  work: () => Promise<T>,
): Promise<T> {
  stream.send({ type: "thinking" });
  const beat = setInterval(() => stream.send({ type: "thinking" }), everyMs);
  try {
    return await work();
  } finally {
    clearInterval(beat);
  }
}

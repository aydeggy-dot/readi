import type { AdvanceInterviewRequest, InterviewFrame } from "@readi/shared-types";
import { errorCode } from "@readi/api-client";
import { type ApiFailure, networkFailure } from "@/lib/api-errors";
import { interviewFailure } from "@/lib/interview-errors";

/**
 * One exchange of an interview, read frame by frame (ADR-0016).
 *
 * This is the **one hand-written client module** in the web app: the generated API client does not
 * model a streaming response (ADR-0012), so everything else on these screens still goes through
 * `browserApi` and this does not.
 *
 * `fetch` with a `ReadableStream` reader rather than `EventSource`, because the route is a POST
 * with a body and a session cookie and `EventSource` can do neither. Same-origin `/api/...`, so the
 * cookie rides along through `proxy.ts` and Next's rewrite — `scripts/sse-rewrite-proof.mjs` is the
 * proof that neither buffers it.
 *
 * **An exchange is all-or-nothing.** Nothing is persisted until the worker has answered in full, so
 * every failure here means "the same action may simply be sent again", and a candidate who
 * navigates away mid-exchange has lost nothing.
 */

/** What became of one exchange. Four of the five are not "an error to show". */
export type AdvanceOutcome =
  | { kind: "ok" }
  /**
   * Another exchange is already in flight for this session (`interview_busy`). Almost always a
   * double-tapped send button, and the right thing on screen is nothing at all: the exchange the
   * candidate did start is still running and will draw its own turns.
   */
  | { kind: "busy" }
  /** The caller went away (unmount, or a second action). Not a failure; nothing to say. */
  | { kind: "aborted" }
  /** The session is over, or too cold to resume. The screen moves rather than apologising. */
  | { kind: "stale"; code: "interview_ended" | "interview_expired" }
  | { kind: "failed"; failure: ApiFailure };

export interface AdvanceOptions {
  /** Called once per frame, in arrival order. */
  onFrame: (frame: InterviewFrame) => void;
  /** Aborted on unmount. */
  signal?: AbortSignal;
  /** Injected by the tests; the browser's own `fetch` otherwise. */
  fetchImpl?: typeof fetch;
}

const DATA_PREFIX = "data:";

/**
 * The frames complete in `buffer`, and whatever is left over.
 *
 * A frame can be split across two reads, so the remainder has to be carried forward rather than
 * parsed hopefully — which is the one bug a hand-written SSE client always has. Exported for its
 * own test; `apps/api/test/sse.ts` is the same parser on the other side of the wire.
 */
export function parseFrames(buffer: string): { frames: InterviewFrame[]; rest: string } {
  const messages = buffer.split("\n\n");
  // The last piece is either empty (the buffer ended on a boundary) or an unfinished message.
  const rest = messages.pop() ?? "";
  const frames: InterviewFrame[] = [];
  for (const message of messages) {
    // Per message rather than per buffer, so an SSE comment line before the data is skipped.
    const line = message.split("\n").find((candidate) => candidate.startsWith(DATA_PREFIX));
    if (!line) continue;
    frames.push(asFrame(JSON.parse(line.slice(DATA_PREFIX.length))));
  }
  return { frames, rest };
}

/**
 * The frames are validated on the way *out* of the API, against the same contract this imports as
 * a type (`InterviewStream.send`), so this checks the discriminator and no more: Zod must not reach
 * the browser bundle (ADR-0001), and a shape drift is the API's build failing, not this.
 */
function asFrame(value: unknown): InterviewFrame {
  if (typeof value === "object" && value !== null && "type" in value) {
    return value as InterviewFrame;
  }
  throw new Error("interview stream: a message with no frame type");
}

/** Sends one action and streams back what it produced. */
export async function advanceInterview(
  id: string,
  body: AdvanceInterviewRequest,
  { onFrame, signal, fetchImpl = fetch }: AdvanceOptions,
): Promise<AdvanceOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(`/api/interviews/${encodeURIComponent(id)}/advance`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch {
    return signal?.aborted ? { kind: "aborted" } : { kind: "failed", failure: networkFailure() };
  }

  /*
   * A refusal before the stream opened is an ordinary HTTP error with an `ApiError` body (ADR-0016
   * decision 2). Read it before touching the body as a stream: it is JSON, not an event stream.
   */
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => undefined);
    const code = errorCode(error);
    if (code === "interview_busy") return { kind: "busy" };
    if (code === "interview_ended" || code === "interview_expired") return { kind: "stale", code };
    return { kind: "failed", failure: interviewFailure(response.status, error) };
  }
  if (!response.body) return { kind: "failed", failure: networkFailure() };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseFrames(buffer);
      buffer = parsed.rest;
      for (const frame of parsed.frames) onFrame(frame);
    }
  } catch {
    return signal?.aborted ? { kind: "aborted" } : { kind: "failed", failure: networkFailure() };
  }
  return { kind: "ok" };
}

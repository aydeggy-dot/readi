import type { InterviewFrame } from "@readi/shared-types";

/**
 * The frames a browser would parse out of an event stream (ADR-0016).
 *
 * Its own module rather than an export from a spec: importing a helper out of a `*.spec.ts` makes
 * Vitest run that file's tests again inside whichever file imported it, and a failure then reports
 * against the wrong spec.
 */
export function framesOf(body: string): InterviewFrame[] {
  return body
    .split("\n\n")
    .map((message) => message.trim())
    .filter((message) => message.startsWith("data:"))
    .map((message) => JSON.parse(message.slice("data:".length)) as InterviewFrame);
}

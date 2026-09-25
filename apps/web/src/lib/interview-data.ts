// Server-only data loaders for the Practice, interview and completion screens.
import type {
  InterviewListResponse,
  InterviewSessionResponse,
  InterviewSummary,
} from "@readi/shared-types";
import { serverApi } from "./session";

/** This candidate's sessions, newest first, keyset-paged like the rest of the API. */
export async function listInterviews(cursor?: string): Promise<InterviewListResponse> {
  const { data, response } = await (
    await serverApi()
  ).GET("/api/interviews", { params: { query: cursor ? { cursor } : {} } });
  if (!data) throw new Error(`GET /api/interviews failed with HTTP ${response.status}`);
  return data;
}

/**
 * One session and everything said in it so far — how the interview screen resumes.
 *
 * `null` on a 404, which is also the answer for another candidate's session: every interview route
 * is scoped to the signed-in user, so "not yours" and "not there" are deliberately the same reply.
 */
export async function getInterview(id: string): Promise<InterviewSessionResponse | null> {
  const { data, response } = await (
    await serverApi()
  ).GET("/api/interviews/{id}", { params: { path: { id } } });
  if (response.status === 404) return null;
  if (!data) throw new Error(`GET /api/interviews/{id} failed with HTTP ${response.status}`);
  return data;
}

/**
 * The one session that is still running, if any.
 *
 * One live interview per candidate: starting a new one abandons whatever was running
 * (`interview-sessions.repository.ts`), so the Practice list offers to resume rather than letting
 * somebody lose an interview by pressing the obvious button.
 */
export function activeInterview(items: readonly InterviewSummary[]): InterviewSummary | undefined {
  return items.find((item) => item.status === "in_progress");
}

/**
 * The server's clock, for the first paint of the interview timer.
 *
 * A server component renders once per request, so reading the clock in one is well defined — unlike
 * in a client component, where a re-render would change the answer under React's feet
 * (`react-hooks/purity`). It is a helper for the same reason `todayIsoDate()` in `profile-data.ts`
 * is one: the call belongs in a named server-only function that says what it is for.
 */
export const serverNow = (): number => new Date().getTime();

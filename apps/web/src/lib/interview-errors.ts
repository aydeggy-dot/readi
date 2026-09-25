import { errorCode } from "@readi/api-client";
import { t } from "@/i18n";
import { type ApiFailure, apiFailure } from "@/lib/api-errors";

/**
 * The interview routes' refusals, in the candidate's words (ADR-0012: the web app never shows the
 * API's English message). Same shape as `content-errors.ts`, for the same reason.
 *
 * Two kinds of failure reach this file, and ADR-0016 is why they are different. Anything the API
 * knows **before** the stream opens is an ordinary HTTP error with a code; once the headers are out
 * the status is already 200, so a failure after that arrives as an `error` **frame**. The frame
 * codes are the second map below.
 */
const MESSAGES: Record<string, string> = {
  // Advancing a session.
  interview_not_found: "interview.errors.notFound",
  interview_ended: "interview.errors.ended",
  interview_expired: "interview.errors.expired",
  // Starting one.
  no_questions_available: "interview.errors.noQuestions",
  profile_required: "interview.errors.profileRequired",
  level_not_offered: "interview.errors.levelNotOffered",
  stack_not_offered: "interview.errors.stackNotOffered",
  rate_limited: "interview.errors.rateLimited",
  /*
   * The setup screen named a role, level or variant that has stopped being published while the page
   * was open — the stale-tab case, exactly as the CMS has it (`content-errors.ts`). One message for
   * all three: what the candidate has to do is the same, and which of the three moved is our
   * problem rather than theirs.
   */
  role_not_found: "interview.errors.catalogueGone",
  level_not_found: "interview.errors.catalogueGone",
  stack_not_found: "interview.errors.catalogueGone",
};

/** Translated copy for an interview API error body, or undefined if its code is not one of ours. */
export function interviewErrorMessage(body: unknown): string | undefined {
  const code = errorCode(body);
  const key = code ? MESSAGES[code] : undefined;
  // The keys above are literals from this file, so the cast is a lookup, not an assumption.
  return key ? t(key as Parameters<typeof t>[0]) : undefined;
}

/**
 * An interview call that failed: our copy when the code is one of ours, and the generic ladder
 * (401 → sign in again, 429 → slow down) otherwise.
 */
export function interviewFailure(status: number, body: unknown): ApiFailure {
  const message = interviewErrorMessage(body);
  return message ? { message, signedOut: false } : apiFailure(status);
}

/** An `error` frame, which means the exchange produced nothing and may simply be sent again. */
export function frameFailure(code: "worker_unavailable" | "interview_error"): ApiFailure {
  return {
    message:
      code === "worker_unavailable"
        ? t("interview.errors.workerUnavailable")
        : t("interview.errors.interviewError"),
    signedOut: false,
  };
}

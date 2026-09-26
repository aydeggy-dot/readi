import { describe, expect, it } from "vitest";
import { frameFailure, interviewErrorMessage, interviewFailure } from "./interview-errors";

describe("interviewErrorMessage", () => {
  it("answers in the candidate's words for every code the interview routes can return", () => {
    const codes = [
      "interview_not_found",
      "interview_ended",
      "interview_expired",
      "no_questions_available",
      "profile_required",
      "level_not_offered",
      "stack_not_offered",
      "rate_limited",
      "role_not_found",
      "level_not_found",
      "stack_not_found",
    ];
    for (const code of codes) {
      const message = interviewErrorMessage({ code, message: "the API's English" });
      expect(message, code).toBeTruthy();
      // ADR-0012: never the server's own message.
      expect(message).not.toBe("the API's English");
    }
  });

  it("does not claim a code it does not know", () => {
    expect(interviewErrorMessage({ code: "something_new" })).toBeUndefined();
    expect(interviewErrorMessage(undefined)).toBeUndefined();
  });

  it("says the same thing about a role, a level and a variant that have moved", () => {
    const messages = ["role_not_found", "level_not_found", "stack_not_found"].map((code) =>
      interviewErrorMessage({ code }),
    );
    expect(new Set(messages).size).toBe(1);
  });
});

describe("interviewFailure", () => {
  it("falls back to the generic ladder, so a long-open page still offers a way back in", () => {
    const expired = interviewFailure(401, {});
    expect(expired.message).toMatch(/session has ended/i);
    expect(expired.signedOut).toBe(true);
    expect(interviewFailure(500, {}).signedOut).toBe(false);
  });

  it("prefers our copy over the status when the body carries a code", () => {
    expect(interviewFailure(429, { code: "rate_limited" }).message).toMatch(/started a lot/i);
  });
});

describe("frameFailure", () => {
  it("says the exchange may simply be sent again, because nothing was stored", () => {
    for (const code of ["worker_unavailable", "interview_error"] as const) {
      expect(frameFailure(code).message).toMatch(/again/i);
    }
  });
});

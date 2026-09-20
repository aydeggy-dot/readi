import { describe, expect, it } from "vitest";
import { apiFailure, networkFailure } from "./api-errors";

describe("apiFailure", () => {
  it("treats 401 as the session having ended, and says so", () => {
    const failure = apiFailure(401);
    expect(failure.signedOut).toBe(true);
    expect(failure.message).toMatch(/sign in again/i);
  });

  it("maps rate limiting and anything else", () => {
    expect(apiFailure(429).message).toMatch(/too many/i);
    expect(apiFailure(429).signedOut).toBe(false);
    expect(apiFailure(500).signedOut).toBe(false);
  });

  it("prefers a screen's own copy for a status it explains itself", () => {
    expect(apiFailure(422, { 422: "This file is damaged." })).toEqual({
      message: "This file is damaged.",
      signedOut: false,
    });
  });

  it("does not let an override hide an ended session", () => {
    expect(apiFailure(401, { 422: "This file is damaged." }).signedOut).toBe(true);
  });

  it("describes a network failure without blaming the user", () => {
    expect(networkFailure().message).toMatch(/connection/i);
  });
});

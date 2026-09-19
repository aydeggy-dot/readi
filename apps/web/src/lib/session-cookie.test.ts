import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "./session-cookie";

describe("hasSessionCookie", () => {
  it("recognises the plain and __Secure- session cookies", () => {
    expect(hasSessionCookie(["readi.session_token"])).toBe(true);
    expect(hasSessionCookie(["other", "__Secure-readi.session_token"])).toBe(true);
  });

  it("ignores other cookies, including Better Auth's unprefixed default", () => {
    expect(hasSessionCookie([])).toBe(false);
    expect(hasSessionCookie(["better-auth.session_token", "readi.session_data"])).toBe(false);
  });
});

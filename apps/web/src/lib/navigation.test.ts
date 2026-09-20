import { describe, expect, it } from "vitest";
import { nextOnboardingPath, safeNextPath, isoDateParam } from "./navigation";

describe("safeNextPath", () => {
  it.each(["/home", "/profile/edit?x=1", "/onboarding/consent"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    null,
    "",
    "home",
    "//evil.test",
    "/\\evil.test",
    "https://evil.test",
    "/api/auth/sign-out",
  ])("falls back for %s", (next) => {
    expect(safeNextPath(next)).toBe("/home");
  });
});

describe("nextOnboardingPath", () => {
  const state = { profile_completed: true, consents_completed: true, completed_at: null };

  it("starts with the profile", () => {
    expect(nextOnboardingPath({ ...state, profile_completed: false })).toBe("/onboarding/profile");
  });

  it("then asks for consent until onboarding is completed", () => {
    expect(nextOnboardingPath(state)).toBe("/onboarding/consent");
  });

  it("is done once completed", () => {
    expect(nextOnboardingPath({ ...state, completed_at: "2026-09-19T12:00:00.000Z" })).toBeNull();
  });
});

describe("isoDateParam", () => {
  it("accepts a calendar date only", () => {
    expect(isoDateParam("2026-09-26")).toBe("2026-09-26");
    for (const value of [
      undefined,
      "",
      "2026-13-01",
      "26/09/2026",
      "2026-09-26T00:00",
      ["2026-09-26"],
    ]) {
      expect(isoDateParam(value)).toBeNull();
    }
  });
});

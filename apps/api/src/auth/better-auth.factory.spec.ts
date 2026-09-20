import { describe, expect, it } from "vitest";
import { signupMethodFor } from "./better-auth.factory";

describe("signupMethodFor", () => {
  it.each([
    [{ path: "/sign-up/email" }, "email"],
    [{ path: "/phone-number/verify" }, "phone"],
    [{ path: "/callback/:id", params: { id: "google" } }, "google"],
    [{ path: "/callback/google" }, "google"],
    [{ path: "/sign-in/social", body: { provider: "google" } }, "google"],
  ])("maps %j to %s", (context, method) => {
    expect(signupMethodFor(context)).toBe(method);
  });

  it.each([
    null,
    { path: "/sign-in/anonymous" },
    { path: "/callback/:id", params: { id: "github" } },
  ])("refuses unknown sign-up routes %j", (context) => {
    expect(() => signupMethodFor(context)).toThrow();
  });
});

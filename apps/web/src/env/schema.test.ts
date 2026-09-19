import { describe, expect, it } from "vitest";
import { parseClientEnv, parseServerEnv } from "./schema";

describe("parseServerEnv", () => {
  it("defaults the API URL to the local API", () => {
    expect(parseServerEnv({}).API_INTERNAL_URL).toBe("http://127.0.0.1:4000");
  });

  it("treats empty optional variables as unset", () => {
    expect(parseServerEnv({ SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
  });

  it("names invalid variables", () => {
    expect(() => parseServerEnv({ API_INTERNAL_URL: "not a url" })).toThrow(/API_INTERNAL_URL/);
  });
});

describe("parseClientEnv", () => {
  it("accepts an empty configuration (analytics and error reporting disabled)", () => {
    expect(parseClientEnv({ NEXT_PUBLIC_POSTHOG_KEY: "", NEXT_PUBLIC_SENTRY_DSN: "" })).toEqual({});
  });

  it("rejects an invalid Sentry DSN", () => {
    expect(() => parseClientEnv({ NEXT_PUBLIC_SENTRY_DSN: "nope" })).toThrow(
      /NEXT_PUBLIC_SENTRY_DSN/,
    );
  });
});

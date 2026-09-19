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

describe("parseServerEnv in production", () => {
  it("requires the proxy secret and client IP header", () => {
    expect(() => parseServerEnv({ APP_ENV: "production" })).toThrow(
      /WEB_PROXY_SECRET[\s\S]*CLIENT_IP_HEADER/,
    );
  });

  it("accepts a complete production configuration", () => {
    const env = parseServerEnv({
      APP_ENV: "production",
      WEB_PROXY_SECRET: "s".repeat(32),
      CLIENT_IP_HEADER: "CF-Connecting-IP",
    });
    expect(env.CLIENT_IP_HEADER).toBe("cf-connecting-ip");
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

import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://readi:readi@localhost:15432/readi",
  REDIS_URL: "redis://localhost:16379/0",
  BETTER_AUTH_SECRET: "x".repeat(32),
  AI_WORKER_TOKEN: "w".repeat(32),
};

const production = {
  ...valid,
  NODE_ENV: "production",
  PUBLIC_WEB_URL: "https://readi.example",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_x",
  SMS_PROVIDER: "termii",
  TERMII_API_KEY: "t_x",
  TERMII_SENDER_ID: "Readi",
  TERMII_BASE_URL: "https://termii.example",
  WEB_PROXY_SECRET: "p".repeat(32),
  S3_ENDPOINT: "https://account.r2.cloudflarestorage.com",
  S3_ACCESS_KEY_ID: "r2_key",
  S3_SECRET_ACCESS_KEY: "r2_secret",
};

describe("parseEnv", () => {
  it("applies defaults", () => {
    const env = parseEnv(valid);
    expect(env).toMatchObject({ NODE_ENV: "development", HOST: "127.0.0.1", PORT: 4000 });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("coerces numeric variables", () => {
    expect(parseEnv({ ...valid, PORT: "4100" }).PORT).toBe(4100);
  });

  it("treats an empty optional variable as unset", () => {
    expect(parseEnv({ ...valid, SENTRY_DSN: "" }).SENTRY_DSN).toBeUndefined();
  });

  it("names every missing required variable", () => {
    expect(() => parseEnv({})).toThrow(EnvValidationError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
  });

  it("rejects a non-postgres database URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/readi" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("never echoes invalid values, which may be secrets", () => {
    const secret = "postgres-password-s3cr3t";
    try {
      parseEnv({ ...valid, DATABASE_URL: secret, PORT: "not-a-port" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toMatch(/PORT/);
    }
  });

  it("requires a long auth secret", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("requires both Google credentials or neither", () => {
    expect(() => parseEnv({ ...valid, GOOGLE_CLIENT_ID: "id" })).toThrow(/GOOGLE_CLIENT_SECRET/);
    expect(
      parseEnv({ ...valid, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).GOOGLE_CLIENT_ID,
    ).toBe("id");
  });

  it("requires provider credentials for resend and termii", () => {
    expect(() => parseEnv({ ...valid, EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...valid, SMS_PROVIDER: "termii" })).toThrow(/TERMII_API_KEY/);
  });

  it("accepts a complete production configuration", () => {
    expect(parseEnv(production).NODE_ENV).toBe("production");
  });

  it.each([
    ["console email", { EMAIL_PROVIDER: "console" }, /EMAIL_PROVIDER/],
    ["console SMS", { SMS_PROVIDER: "console" }, /SMS_PROVIDER/],
    ["plain http", { PUBLIC_WEB_URL: "http://readi.example" }, /PUBLIC_WEB_URL/],
    ["no proxy secret", { WEB_PROXY_SECRET: "" }, /WEB_PROXY_SECRET/],
  ])("rejects %s in production", (_label, change, message) => {
    expect(() => parseEnv({ ...production, ...change })).toThrow(message);
  });

  it("requires the AI worker token", () => {
    const { AI_WORKER_TOKEN: _omit, ...withoutToken } = valid;
    expect(() => parseEnv(withoutToken)).toThrow(/AI_WORKER_TOKEN/);
    expect(() => parseEnv({ ...valid, AI_WORKER_TOKEN: "short" })).toThrow(/AI_WORKER_TOKEN/);
  });

  it("defaults storage to the local SeaweedFS but refuses its credentials in production", () => {
    expect(parseEnv(valid)).toMatchObject({
      S3_ENDPOINT: "http://127.0.0.1:19000",
      S3_BUCKET: "readi-dev",
    });
    expect(() =>
      parseEnv({ ...production, S3_ACCESS_KEY_ID: undefined, S3_SECRET_ACCESS_KEY: undefined }),
    ).toThrow(/S3_SECRET_ACCESS_KEY/);
    expect(() => parseEnv({ ...production, S3_ENDPOINT: "http://s3.example" })).toThrow(
      /S3_ENDPOINT/,
    );
  });
});

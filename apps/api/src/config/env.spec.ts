import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://readi:readi@localhost:15432/readi",
  REDIS_URL: "redis://localhost:16379/0",
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
});

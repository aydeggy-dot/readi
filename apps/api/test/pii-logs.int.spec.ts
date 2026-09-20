import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REDACTED_PHONE } from "../src/logging/scrub";
import { ScrubbingLogger } from "../src/logging/scrubbing-logger";
import {
  createTestApp,
  PASSWORD,
  requestOtp,
  signUpWithEmail,
  uniqueEmail,
  uniqueNigerianMobile,
  viaProxy,
} from "./helpers";

/**
 * Acceptance: no PII in logs. Runs real sign-up/sign-in/OTP flows with every log level enabled and
 * captures everything the app writes to stdout/stderr.
 */
describe("PII in logs", () => {
  let app: NestExpressApplication;
  let output = "";
  const writes = {
    out: process.stdout.write.bind(process.stdout),
    err: process.stderr.write.bind(process.stderr),
  };

  beforeAll(async () => {
    const capture = (chunk: unknown) => {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString();
      return true;
    };
    process.stdout.write = capture;
    process.stderr.write = capture;
    const logger = new ScrubbingLogger();
    logger.setLogLevels(["log", "error", "warn", "debug", "verbose", "fatal"]);
    app = await createTestApp({ logger });
  });

  afterAll(async () => {
    await app.close();
    process.stdout.write = writes.out;
    process.stderr.write = writes.err;
  });

  it("never writes emails or phone numbers", async () => {
    const email = uniqueEmail();
    await signUpWithEmail(app, email);
    // Failed sign-in and duplicate sign-up exercise Better Auth's warning/error paths.
    await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set(viaProxy())
      .send({ email, password: "definitely the wrong one" });
    await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set(viaProxy())
      .send({ email, password: PASSWORD, name: "Dup" });
    const phone = uniqueNigerianMobile();
    await requestOtp(app, phone);

    // The console SMS provider logs every OTP, so there is output to check (and it is redacted).
    expect(output).toContain(REDACTED_PHONE);
    const local = email.split("@")[0] ?? email;
    for (const needle of [email, local, phone, phone.slice(1), `0${phone.slice(4)}`]) {
      expect(output).not.toContain(needle);
    }
  });
});

import request from "supertest";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env";
import { DevMailboxModule } from "../src/dev-mailbox/dev-mailbox.module";
import { DevMailboxService } from "../src/dev-mailbox/dev-mailbox.service";
import { EmailSender } from "../src/notifications/email";
import { usesDevMailbox } from "../src/notifications/notifications.module";
import { createTestApp } from "./helpers";

// A complete, valid production configuration with fake provider credentials (never called here).
const production = {
  NODE_ENV: "production",
  PUBLIC_WEB_URL: "https://readi.example",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_test_not_real",
  SMS_PROVIDER: "termii",
  TERMII_API_KEY: "termii_test_not_real",
  TERMII_SENDER_ID: "Readi",
  TERMII_BASE_URL: "https://termii.example",
  S3_ENDPOINT: "https://s3.readi.example",
  S3_ACCESS_KEY_ID: "s3_test_not_real",
  S3_SECRET_ACCESS_KEY: "s3_secret_test_not_real",
};

describe("dev mailbox", () => {
  it("is not registered at all in production", async () => {
    const app = await createTestApp({ env: production });
    try {
      // The module is absent from the container, not merely disabled...
      expect(() => app.get(DevMailboxModule, { strict: false })).toThrow();
      expect(() => app.get(DevMailboxService, { strict: false })).toThrow();
      // ...so its route does not exist.
      const response = await request(app.getHttpServer())
        .get("/api/dev/mailbox")
        .query({ to: "a@b.co" });
      expect(response.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("cannot be enabled in production through configuration", () => {
    expect(() => parseEnv({ ...process.env, ...production, EMAIL_PROVIDER: "console" })).toThrow(
      /EMAIL_PROVIDER/,
    );
    expect(() => parseEnv({ ...process.env, ...production, SMS_PROVIDER: "console" })).toThrow(
      /SMS_PROVIDER/,
    );
    expect(usesDevMailbox(parseEnv({ ...process.env, ...production }))).toBe(false);
  });

  it("is available in development/test", async () => {
    const app = await createTestApp();
    try {
      expect(app.get(DevMailboxService, { strict: false })).toBeInstanceOf(DevMailboxService);
      const response = await request(app.getHttpServer())
        .get("/api/dev/mailbox")
        .query({ to: "a@b.co" });
      expect(response.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("the app's email sender refuses placeholder addresses and stores nothing", async () => {
    const app = await createTestApp();
    try {
      const to = "user-0000@phone.readi.invalid";
      await expect(app.get(EmailSender).send({ to, subject: "s", text: "t" })).rejects.toThrow(
        /\.invalid/,
      );
      const mailbox = await request(app.getHttpServer()).get("/api/dev/mailbox").query({ to });
      expect(mailbox.body).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

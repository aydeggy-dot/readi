import type { NestExpressApplication } from "@nestjs/platform-express";
import { MeResponse } from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DISABLED_AUTH_PATHS } from "../src/auth/better-auth.factory";
import { isPlaceholderEmail } from "../src/auth/phone";
import { PrismaService } from "../src/prisma/prisma.service";
import { setUserRole } from "../src/users/roles.service";
import {
  createTestApp,
  PASSWORD,
  readMailbox,
  requestOtp,
  sessionCookie,
  signUpWithEmail,
  uniqueEmail,
  uniqueIp,
  uniqueNigerianMobile,
  viaProxy,
} from "./helpers";

const ORIGIN = "http://localhost:3002";

describe("authentication (Better Auth mounted in Nest)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  const me = async (cookie?: string) => {
    const req = http().get("/api/me");
    return cookie ? req.set("cookie", cookie) : req;
  };

  describe("email + password", () => {
    it("signs up, sets a session cookie and records signup_method=email", async () => {
      const { email, cookie } = await signUpWithEmail(app);

      const response = await me(cookie);

      expect(response.status).toBe(200);
      const body = MeResponse.parse(response.body);
      expect(body).toMatchObject({
        email,
        role: "candidate",
        signup_method: "email",
        email_verified: false,
        phone_number: null,
      });
    });

    it("sends a verification email to the dev mailbox", async () => {
      const { email } = await signUpWithEmail(app);

      const [message] = await readMailbox(app, email);

      expect(message?.channel).toBe("email");
      expect(message?.body).toContain("/api/auth/verify-email?token=");
    });

    it("sets httpOnly, SameSite=Lax session cookies", async () => {
      const response = await http()
        .post("/api/auth/sign-up/email")
        .set(viaProxy())
        .send({ email: uniqueEmail(), password: PASSWORD, name: "Test" });

      const cookies = response.headers["set-cookie"] as unknown as string[];
      const session = cookies.find((c) => c.startsWith("readi.session_token="));
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
    });

    // Fields marked `input: false` are never client-writable. Better Auth silently ignores the ones
    // with a default (role) and rejects the rest; both behaviours are pinned here.
    it("ignores a client-supplied role", async () => {
      const { email, cookie } = await signUpWithEmail(app, uniqueEmail(), { role: "admin" });

      expect(MeResponse.parse((await me(cookie)).body).role).toBe("candidate");
      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.role).toBe("candidate");
    });

    it.each([
      ["signupMethod", { signupMethod: "phone" }],
      ["deletedAt", { deletedAt: new Date().toISOString() }],
      ["deletionScheduledFor", { deletionScheduledFor: new Date().toISOString() }],
    ])("rejects a client-supplied %s and creates no user", async (_field, extra) => {
      const email = uniqueEmail();
      const response = await http()
        .post("/api/auth/sign-up/email")
        .set(viaProxy())
        .send({ email, password: PASSWORD, name: "Test", ...extra });

      expect(response.status).toBe(400);
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });

    it("does not let update-user change the role", async () => {
      const { email, cookie } = await signUpWithEmail(app);

      await http()
        .post("/api/auth/update-user")
        .set("cookie", cookie)
        .set("origin", ORIGIN)
        .send({ role: "admin" });

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.role).toBe("candidate");
    });

    it("signs in with the password", async () => {
      const { email } = await signUpWithEmail(app);

      const response = await http()
        .post("/api/auth/sign-in/email")
        .set(viaProxy())
        .send({ email, password: PASSWORD });

      expect(response.status).toBe(200);
      expect((await me(sessionCookie(response))).status).toBe(200);
    });

    it("rejects passwords shorter than 10 characters", async () => {
      const response = await http()
        .post("/api/auth/sign-up/email")
        .set(viaProxy())
        .send({ email: uniqueEmail(), password: "short", name: "Test" });

      expect(response.status).toBe(400);
    });

    it("rate-limits repeated sign-in attempts from one IP", async () => {
      const ip = uniqueIp();
      const attempt = () =>
        http()
          .post("/api/auth/sign-in/email")
          .set(viaProxy(ip))
          .send({ email: uniqueEmail(), password: "wrong password 123" });

      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await attempt()).status);

      expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    });
  });

  describe("client IP trust (rate-limit buckets, ADR-0009)", () => {
    const badSignIn = (headers: Record<string, string>) =>
      http()
        .post("/api/auth/sign-in/email")
        .set({ origin: ORIGIN, ...headers })
        .send({ email: uniqueEmail(), password: "wrong password 123" });

    it("gives each proxied client IP its own bucket", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await badSignIn(viaProxy(uniqueIp()))).status);

      expect(statuses.every((s) => s === 401)).toBe(true);
    });

    it("ignores client-chosen IPs without the proxy secret (no fresh bucket per request)", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push(
          (
            await badSignIn({
              "x-readi-client-ip": uniqueIp(),
              "x-readi-proxy-secret": "wrong-secret-wrong-secret-wrong-secret",
              "x-forwarded-for": uniqueIp(),
            })
          ).status,
        );
      }

      // All six share the no-trusted-IP bucket (limit 5/min), so the limit must trigger.
      expect(statuses).toContain(429);
    });
  });

  describe("phone OTP (Nigerian numbers)", () => {
    it("signs up by OTP with a hidden placeholder email and signup_method=phone", async () => {
      const phone = uniqueNigerianMobile();
      const code = await requestOtp(app, phone);

      const verify = await http()
        .post("/api/auth/phone-number/verify")
        .set(viaProxy())
        .send({ phoneNumber: phone, code });
      expect(verify.status).toBe(200);

      const body = MeResponse.parse((await me(sessionCookie(verify))).body);
      expect(body).toMatchObject({
        email: null,
        phone_number: phone,
        phone_number_verified: true,
        signup_method: "phone",
        role: "candidate",
      });
      const stored = await prisma.user.findUniqueOrThrow({ where: { phoneNumber: phone } });
      expect(isPlaceholderEmail(stored.email)).toBe(true);
      expect(stored.email).not.toContain(phone.slice(1));
      expect(stored.name).toBe("");
    });

    it("rejects a wrong code", async () => {
      const phone = uniqueNigerianMobile();
      await requestOtp(app, phone);

      const response = await http()
        .post("/api/auth/phone-number/verify")
        .set(viaProxy())
        .send({ phoneNumber: phone, code: "000000" });

      expect(response.status).toBe(400);
    });

    it.each([
      ["a UK number", "+447911123456"],
      ["local format", "08031234567"],
      ["an invalid number", "+2340000"],
    ])("rejects %s", async (_label, phoneNumber) => {
      const response = await http()
        .post("/api/auth/phone-number/send-otp")
        .set(viaProxy())
        .send({ phoneNumber });

      expect(response.status).toBe(400);
    });

    it("does not expose the password-reset or password sign-in routes", async () => {
      const phone = uniqueNigerianMobile();
      // These exist in the plugin but are not part of Readi's flows: reachable, they let anyone
      // mint reset codes for a number and set a password on the account (see DISABLED_AUTH_PATHS).
      for (const path of DISABLED_AUTH_PATHS) {
        const response = await http()
          .post(`/api/auth${path}`)
          .set(viaProxy())
          .send({ phoneNumber: phone, otp: "000000", newPassword: PASSWORD, password: PASSWORD });
        expect(response.status, `POST /api/auth${path}`).toBe(404);
      }
      // Nothing was stored for that number, and the routes we do offer still work.
      expect(await prisma.verification.count({ where: { identifier: { contains: phone } } })).toBe(
        0,
      );
      expect(
        (
          await http()
            .post("/api/auth/phone-number/send-otp")
            .set(viaProxy())
            .send({ phoneNumber: phone })
        ).status,
      ).toBe(200);
    });
  });

  describe("authorization", () => {
    it("rejects unauthenticated requests by default", async () => {
      expect((await me()).status).toBe(401);
      expect((await http().get("/api/admin/stats")).status).toBe(401);
    });

    it("rejects candidates on admin routes and allows admins", async () => {
      const { email, cookie } = await signUpWithEmail(app);

      expect((await http().get("/api/admin/stats").set("cookie", cookie)).status).toBe(403);

      await setUserRole(prisma, { email, role: "admin", actor: { type: "system" } });

      const response = await http().get("/api/admin/stats").set("cookie", cookie);
      expect(response.status).toBe(200);
      // Other test files add users in parallel, so assert what cannot drift: the shape is
      // internally consistent, this admin is counted, and a soft-deleted user drops out.
      const read = async () =>
        (await http().get("/api/admin/stats").set("cookie", cookie)).body as {
          users_total: number;
          users_by_role: Record<string, number>;
        };
      const stats = response.body as { users_total: number; users_by_role: Record<string, number> };
      expect(Object.values(stats.users_by_role).reduce((sum, n) => sum + n, 0)).toBe(
        stats.users_total,
      );
      expect(stats.users_by_role.admin).toBeGreaterThanOrEqual(1);

      const expert = await signUpWithEmail(app);
      await setUserRole(prisma, {
        email: expert.email,
        role: "content_expert",
        actor: { type: "system" },
      });
      const withExpert = await read();
      await prisma.user.update({
        where: { email: expert.email },
        data: { deletedAt: new Date(), deletionScheduledFor: new Date(Date.now() + 86_400_000) },
      });
      const afterDeletion = await read();
      expect((afterDeletion.users_by_role.content_expert ?? 0) + 1).toBe(
        withExpert.users_by_role.content_expert,
      );
    });

    it("audits role changes", async () => {
      const { email } = await signUpWithEmail(app);

      const { userId } = await setUserRole(prisma, {
        email,
        role: "content_expert",
        actor: { type: "system" },
      });

      const entry = await prisma.auditLog.findFirstOrThrow({
        where: { targetId: userId, action: "user.role.changed" },
      });
      expect(entry).toMatchObject({
        actorType: "system",
        before: { role: "candidate" },
        after: { role: "content_expert" },
      });
    });

    it("keeps /health public", async () => {
      expect([200, 503]).toContain((await http().get("/health")).status);
    });
  });
});

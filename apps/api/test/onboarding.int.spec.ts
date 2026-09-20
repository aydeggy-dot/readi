import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  AuthMethodsResponse,
  CONSENT_TYPES,
  CONSENT_VERSIONS,
  ConsentsResponse,
  MeResponse,
  ProfileResponse,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  createTestApp,
  requestOtp,
  sessionCookie,
  signUpWithEmail,
  uniqueNigerianMobile,
  viaProxy,
} from "./helpers";

const profile = {
  name: "Ada Obi",
  target_role: "frontend",
  level: "intern_junior",
  years_experience: 1,
  stack: ["React", "TypeScript", "react"],
  target_company_type: "remote_foreign",
  target_date: null,
} as const;

const allDecisions = (granted: (type: string) => boolean) =>
  CONSENT_TYPES.map((type) => ({ type, granted: granted(type), version: CONSENT_VERSIONS[type] }));

describe("profile, consent and onboarding", () => {
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

  const signUp = async () => (await signUpWithEmail(app)).cookie;
  const me = async (cookie: string) =>
    MeResponse.parse((await http().get("/api/me").set("cookie", cookie)).body);

  it.each([
    ["get", "/api/me/profile"],
    ["put", "/api/me/profile"],
    ["get", "/api/me/consents"],
    ["put", "/api/me/consents"],
    ["post", "/api/me/onboarding/complete"],
  ] as const)("%s %s requires a session", async (method, path) => {
    expect((await http()[method](path).send({})).status).toBe(401);
  });

  describe("profile", () => {
    it("is 404 before it exists, then saves, dedupes the stack and sets the name", async () => {
      const cookie = await signUp();
      const missing = await http().get("/api/me/profile").set("cookie", cookie);
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ code: "profile_not_found" });

      const saved = await http().put("/api/me/profile").set("cookie", cookie).send(profile);
      expect(saved.status).toBe(200);
      expect(ProfileResponse.parse(saved.body)).toMatchObject({
        ...profile,
        stack: ["React", "TypeScript"],
      });

      const read = await http().get("/api/me/profile").set("cookie", cookie);
      expect(read.body).toEqual(saved.body);
      const user = await me(cookie);
      expect(user.name).toBe("Ada Obi");
      expect(user.onboarding.profile_completed).toBe(true);
    });

    it("replaces the profile on a second save and keeps a calendar date intact", async () => {
      const cookie = await signUp();
      await http().put("/api/me/profile").set("cookie", cookie).send(profile);
      const updated = await http()
        .put("/api/me/profile")
        .set("cookie", cookie)
        .send({
          ...profile,
          level: "mid",
          stack: ["Playwright"],
          target_role: "qa",
          target_date: "2099-01-31",
        });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({
        level: "mid",
        target_role: "qa",
        stack: ["Playwright"],
        target_date: "2099-01-31",
      });
    });

    it.each([
      ["an unknown role", { target_role: "devops" }],
      ["a missing name", { name: "" }],
      ["too much experience", { years_experience: 51 }],
      ["a past target date", { target_date: "2020-01-01" }],
    ])("rejects %s with a field error", async (_label, patch) => {
      const cookie = await signUp();
      const response = await http()
        .put("/api/me/profile")
        .set("cookie", cookie)
        .send({ ...profile, ...patch });
      expect(response.status).toBe(400);
      const [field] = Object.keys(patch);
      expect(
        (response.body as { errors: { path: string[] }[] }).errors.map((e) => e.path[0]),
      ).toContain(field);
    });

    it("cannot be used to change fields outside the profile (role stays candidate)", async () => {
      const cookie = await signUp();
      const response = await http()
        .put("/api/me/profile")
        .set("cookie", cookie)
        .send({ ...profile, role: "admin" });
      // Unknown keys are stripped by the schema; the role is not a profile field.
      expect(response.status).toBe(200);
      expect((await me(cookie)).role).toBe("candidate");
    });
  });

  describe("consents", () => {
    it("starts with nothing granted and no decisions", async () => {
      const cookie = await signUp();
      const response = await http().get("/api/me/consents").set("cookie", cookie);
      const { consents } = ConsentsResponse.parse(response.body);
      expect(consents.map((c) => c.type)).toEqual([...CONSENT_TYPES]);
      expect(consents.every((c) => !c.granted && c.version === null && c.decided_at === null)).toBe(
        true,
      );
    });

    it("appends a record only for decisions that changed", async () => {
      const cookie = await signUp();
      const { id } = await me(cookie);

      await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({ decisions: allDecisions((t) => t === "marketing") });
      expect(await prisma.consentRecord.count({ where: { userId: id } })).toBe(4);

      // Same choices again: nothing new. Then revoke marketing: one new row.
      await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({ decisions: allDecisions((t) => t === "marketing") });
      expect(await prisma.consentRecord.count({ where: { userId: id } })).toBe(4);
      const revoked = await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({
          decisions: [{ type: "marketing", granted: false, version: CONSENT_VERSIONS.marketing }],
        });
      expect(revoked.status).toBe(200);
      expect(await prisma.consentRecord.count({ where: { userId: id } })).toBe(5);

      const marketing = ConsentsResponse.parse(revoked.body).consents.find(
        (c) => c.type === "marketing",
      );
      expect(marketing).toMatchObject({ granted: false, version: 1 });
    });

    it("rejects a decision against an outdated consent text", async () => {
      const cookie = await signUp();
      const response = await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({
          decisions: [
            {
              type: "audio_processing",
              granted: true,
              version: CONSENT_VERSIONS.audio_processing + 1,
            },
          ],
        });
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ code: "consent_version_outdated" });
    });

    it("rejects the same type twice", async () => {
      const cookie = await signUp();
      const decision = { type: "marketing", granted: true, version: CONSENT_VERSIONS.marketing };
      const response = await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({ decisions: [decision, decision] });
      expect(response.status).toBe(400);
    });
  });

  describe("onboarding", () => {
    it("completes only after profile and consents, and is idempotent", async () => {
      const cookie = await signUp();
      const complete = () => http().post("/api/me/onboarding/complete").set("cookie", cookie);

      expect((await complete()).body).toMatchObject({ code: "profile_required" });
      await http().put("/api/me/profile").set("cookie", cookie).send(profile);
      const noConsents = await complete();
      expect(noConsents.status).toBe(409);
      expect(noConsents.body).toMatchObject({ code: "consents_required" });

      await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({ decisions: allDecisions(() => false) });
      const first = await complete();
      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({ profile_completed: true, consents_completed: true });
      const completedAt = (first.body as { completed_at: string }).completed_at;
      expect(Date.parse(completedAt)).not.toBeNaN();

      const again = await complete();
      expect((again.body as { completed_at: string }).completed_at).toBe(completedAt);
      expect((await me(cookie)).onboarding.completed_at).toBe(completedAt);
    });

    it("works for a phone sign-up, whose name starts empty", async () => {
      const phone = uniqueNigerianMobile();
      const code = await requestOtp(app, phone);
      const verified = await http()
        .post("/api/auth/phone-number/verify")
        .set(viaProxy())
        .send({ phoneNumber: phone, code });
      const cookie = sessionCookie(verified);
      expect((await me(cookie)).name).toBe("");

      await http().put("/api/me/profile").set("cookie", cookie).send(profile);
      await http()
        .put("/api/me/consents")
        .set("cookie", cookie)
        .send({ decisions: allDecisions(() => true) });
      expect((await http().post("/api/me/onboarding/complete").set("cookie", cookie)).status).toBe(
        200,
      );
      expect(await me(cookie)).toMatchObject({
        name: "Ada Obi",
        email: null,
        signup_method: "phone",
      });
    });
  });

  it("allows email sign-up without a name (the name is asked for in onboarding)", async () => {
    const { cookie } = await signUpWithEmail(app, undefined, { name: "" });
    expect((await me(cookie)).name).toBe("");
  });

  it("reports configured sign-in methods publicly", async () => {
    const response = await http().get("/api/auth-methods");
    expect(response.status).toBe(200);
    expect(AuthMethodsResponse.parse(response.body)).toEqual({ google: false });

    const withGoogle = await createTestApp({
      env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" },
    });
    try {
      expect((await request(withGoogle.getHttpServer()).get("/api/auth-methods")).body).toEqual({
        google: true,
      });
    } finally {
      await withGoogle.close();
    }
  });
});

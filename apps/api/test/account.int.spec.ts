import { randomUUID } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
  CONSENT_TYPES,
  CONSENT_VERSIONS,
  CvResponse,
  CvUploadResponse,
  DataExport,
  DeleteAccountResponse,
} from "@readi/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountDeletionService } from "../src/account/account-deletion.service";
import { cancelDeletion, DeletionNotCancellableError } from "../src/account/cancel-deletion";
import { eraseUser, TOMBSTONED_COLUMNS } from "../src/account/erase-user";
import { AiWorkerClient } from "../src/ai-worker/ai-worker.client";
import { Prisma } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { removeCataloguePair, seedCataloguePair, type CataloguePair } from "./content-fixtures";
import { StorageService } from "../src/storage/storage.service";
import { FakeAiWorker, PARSED } from "./fake-ai-worker";
import {
  createTestApp,
  PASSWORD,
  readMailbox,
  requestOtp,
  sessionCookie,
  signUpWithEmail,
  uniqueNigerianMobile,
  viaProxy,
} from "./helpers";

const PDF = "application/pdf";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.7\nA CV body that the fake worker never reads.");
const DAY_MS = 86_400_000;
const SUPPORT_EMAIL = "help@readi.example";

/** Minted per run: the catalogue is content, and the test database is never seeded (ADR-0015). */
let pair: CataloguePair;

const profileFor = () => ({
  name: "Ada Obi",
  target_role: pair.roleSlug,
  level: pair.levelSlug,
  years_experience: 3,
  stack: ["Go"],
  target_company_type: "remote_foreign",
  target_date: null,
});

describe("data export and account deletion (ADR-0011)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  const worker = new FakeAiWorker();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      env: { SUPPORT_EMAIL },
      overrides: [[AiWorkerClient, worker]],
    });
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);
    pair = await seedCataloguePair(prisma);
  });
  afterAll(async () => {
    await removeCataloguePair(prisma, pair);
    await app.close();
  });

  async function emailUser(): Promise<{ email: string; cookie: string; userId: string }> {
    const { email, cookie } = await signUpWithEmail(app);
    const me = await http().get("/api/me").set("cookie", cookie);
    return { email, cookie, userId: (me.body as { id: string }).id };
  }

  async function phoneUser(): Promise<{ phone: string; cookie: string; userId: string }> {
    const phone = uniqueNigerianMobile();
    const code = await requestOtp(app, phone);
    const verified = await http()
      .post("/api/auth/phone-number/verify")
      .set(viaProxy())
      .send({ phoneNumber: phone, code });
    const cookie = sessionCookie(verified);
    const me = await http().get("/api/me").set("cookie", cookie);
    return { phone, cookie, userId: (me.body as { id: string }).id };
  }

  /** Profile, consents and a parsed CV: a user with data in every table. */
  async function withData(cookie: string): Promise<void> {
    await http().put("/api/me/profile").set("cookie", cookie).send(profileFor()).expect(200);
    await http()
      .put("/api/me/consents")
      .set("cookie", cookie)
      .send({
        decisions: CONSENT_TYPES.map((type) => ({
          type,
          granted: type !== "marketing",
          version: CONSENT_VERSIONS[type],
        })),
      })
      .expect(200);
    const created = await http()
      .post("/api/me/cv/uploads")
      .set("cookie", cookie)
      .send({ content_type: PDF, size_bytes: PDF_BYTES.length });
    const { upload_id, url, headers } = CvUploadResponse.parse(created.body);
    expect((await fetch(url, { method: "PUT", headers, body: PDF_BYTES })).status).toBe(200);
    await http().post("/api/me/cv").set("cookie", cookie).send({ upload_id }).expect(200);
    for (let i = 0; i < 100; i++) {
      const cv = CvResponse.parse((await http().get("/api/me/cv").set("cookie", cookie)).body);
      if (cv.status === "parsed") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("CV not parsed after 10 s");
  }

  const requestDeletion = (cookie: string) =>
    http().post("/api/me/deletion").set("cookie", cookie).send({ confirmation: "DELETE" });

  const signIn = (email: string) =>
    http().post("/api/auth/sign-in/email").set(viaProxy()).send({ email, password: PASSWORD });

  /** Moves the user's deletion date into the past, as if the grace period had passed. */
  const endGracePeriod = (userId: string) =>
    prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledFor: new Date(Date.now() - 1000) },
    });

  it.each([
    ["get", "/api/me/export"],
    ["post", "/api/me/deletion"],
  ] as const)("%s %s requires a session", async (method, path) => {
    expect((await http()[method](path).send({})).status).toBe(401);
  });

  describe("export", () => {
    it("downloads everything held about the user, with a working CV link and no secrets", async () => {
      const { email, cookie, userId } = await emailUser();
      await withData(cookie);

      const response = await http().get("/api/me/export").set("cookie", cookie);
      expect(response.status).toBe(200);
      expect(response.headers["content-disposition"]).toMatch(
        /^attachment; filename="readi-data-\d{4}-\d{2}-\d{2}\.json"$/,
      );
      expect(response.headers["cache-control"]).toBe("no-store");

      const data = DataExport.parse(response.body);
      expect(data.user).toMatchObject({
        id: userId,
        name: "Ada Obi",
        email,
        signup_method: "email",
        phone_number: null,
      });
      expect(data.user.image).toBeNull(); // set by Google sign-in; absent for email accounts
      expect(data.profile).toMatchObject({ target_role: pair.roleSlug, stack: ["Go"] });
      expect(data.cv).toMatchObject({ status: "parsed", content_type: PDF, parsed: PARSED });
      expect(data.consents).toHaveLength(CONSENT_TYPES.length);
      expect(data.consents.find((c) => c.type === "marketing")?.granted).toBe(false);
      expect(data.linked_accounts).toEqual([expect.objectContaining({ provider: "credential" })]);
      expect(data.sessions.length).toBeGreaterThanOrEqual(1);
      expect(data.ai_processing).toEqual([
        expect.objectContaining({ purpose: "cv_parse", provider: "anthropic", status: "ok" }),
      ]);

      // The CV link downloads the original file, as an attachment.
      const download = await fetch(data.cv.download_url ?? "");
      expect(download.status).toBe(200);
      expect(download.headers.get("content-disposition")).toBe(
        'attachment; filename="readi-cv.pdf"',
      );
      expect(new Uint8Array(await download.arrayBuffer())).toEqual(PDF_BYTES);

      // No password hash, session token or OAuth token anywhere in the file.
      const secrets = [
        ...(await prisma.account.findMany({ where: { userId } })).flatMap((a) =>
          [a.password, a.accessToken, a.refreshToken, a.idToken].filter(Boolean),
        ),
        ...(await prisma.session.findMany({ where: { userId } })).map((s) => s.token),
      ];
      expect(secrets.length).toBeGreaterThan(0);
      for (const secret of secrets) expect(response.text).not.toContain(secret);
    });

    it("gives phone users no email, and does not identify staff in audit entries", async () => {
      const { phone, cookie, userId } = await phoneUser();
      const adminId = randomUUID();
      await prisma.auditLog.create({
        data: {
          actorType: "admin",
          actorId: adminId,
          action: "user.role.changed",
          targetType: "user",
          targetId: userId,
          before: { role: "candidate" },
          after: { role: "content_expert" },
        },
      });

      const response = await http().get("/api/me/export").set("cookie", cookie);
      const data = DataExport.parse(response.body);
      expect(data.user).toMatchObject({ email: null, phone_number: phone, signup_method: "phone" });
      expect(data.profile).toBeNull();
      expect(data.cv).toMatchObject({ status: "none", download_url: null });
      expect(data.audit_entries).toEqual([
        expect.objectContaining({
          action: "user.role.changed",
          actor: "admin",
          target_is_you: true,
        }),
      ]);
      expect(response.text).not.toContain(adminId);
    });

    it("is rate limited", async () => {
      const { cookie } = await emailUser();
      for (let i = 0; i < 5; i++) {
        expect((await http().get("/api/me/export").set("cookie", cookie)).status).toBe(200);
      }
      const limited = await http().get("/api/me/export").set("cookie", cookie);
      expect(limited.status).toBe(429);
      expect(limited.body).toMatchObject({ code: "rate_limited" });
    });
  });

  describe("deletion request", () => {
    it.each([
      [{ confirmation: "delete" }],
      [{ confirmation: "DELETE " }],
      [{ confirmation: "" }],
      [{}],
    ])("refuses the body %j", async (body) => {
      const { cookie, userId } = await emailUser();
      const response = await http().post("/api/me/deletion").set("cookie", cookie).send(body);
      expect(response.status).toBe(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
    });

    it("needs a recent sign-in", async () => {
      const { cookie, userId } = await emailUser();
      await prisma.session.updateMany({
        where: { userId },
        data: { createdAt: new Date(Date.now() - 16 * 60_000) },
      });
      const response = await requestDeletion(cookie);
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: "recent_sign_in_required" });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).deletedAt).toBeNull();
    });

    it("schedules deletion in 7 days, signs out everywhere, notifies and blocks sign-in", async () => {
      const { email, cookie, userId } = await emailUser();
      const second = sessionCookie(await signIn(email));

      const before = Date.now();
      const response = await requestDeletion(cookie);
      expect(response.status).toBe(200);
      const scheduled = Date.parse(
        DeleteAccountResponse.parse(response.body).deletion_scheduled_for,
      );
      expect(scheduled - before).toBeGreaterThanOrEqual(7 * DAY_MS - 1000);
      expect(scheduled - before).toBeLessThan(7 * DAY_MS + 60_000);

      for (const session of [cookie, second]) {
        expect((await http().get("/api/me").set("cookie", session)).status).toBe(401);
      }
      expect(await prisma.session.count({ where: { userId } })).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { action: "user.deletion.requested", actorId: userId, targetId: userId },
        }),
      ).toBe(1);

      const notice = (await readMailbox(app, email)).find((m) =>
        m.subject?.startsWith("Your Readi account will be deleted"),
      );
      expect(notice?.body).toContain(SUPPORT_EMAIL);

      const blocked = await signIn(email);
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({ code: "ACCOUNT_DELETION_PENDING" });
      expect(blocked.headers["set-cookie"]).toBeUndefined();

      // No reset link for an account that cannot sign in.
      const mailboxSize = (await readMailbox(app, email)).length;
      await http()
        .post("/api/auth/request-password-reset")
        .set(viaProxy())
        .send({ email, redirectTo: "/reset-password" })
        .expect(200);
      expect(await readMailbox(app, email)).toHaveLength(mailboxSize);
    });

    it("texts phone users and blocks their next code sign-in", async () => {
      const { phone, cookie } = await phoneUser();
      expect((await requestDeletion(cookie)).status).toBe(200);
      const texts = await readMailbox(app, phone);
      expect(
        texts.some((m) => m.body.includes("will be deleted on") && m.body.includes(SUPPORT_EMAIL)),
      ).toBe(true);

      const code = await requestOtp(app, phone);
      const blocked = await http()
        .post("/api/auth/phone-number/verify")
        .set(viaProxy())
        .send({ phoneNumber: phone, code });
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({ code: "ACCOUNT_DELETION_PENDING" });
    });

    it("ignores any session that survives for an account awaiting deletion", async () => {
      const { cookie, userId } = await emailUser();
      await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
      expect((await http().get("/api/me").set("cookie", cookie)).status).toBe(401);
    });
  });

  describe("erasure after the grace period", () => {
    it("does nothing before the grace period ends", async () => {
      const { cookie, userId } = await emailUser();
      await requestDeletion(cookie).expect(200);
      expect(await eraseUser(prisma, storage, userId)).toBe(false);
      expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
    });

    it("erases personal data and files, and tombstones the rows that are kept", async () => {
      const { email, cookie, userId } = await emailUser();
      await withData(cookie);
      const { cvFileKey } = await prisma.profile.findUniqueOrThrow({ where: { userId } });
      expect(cvFileKey).toBeTruthy();
      await requestDeletion(cookie).expect(200);
      // Leaves a reset token row behind (the email itself is suppressed).
      await http()
        .post("/api/auth/request-password-reset")
        .set(viaProxy())
        .send({ email, redirectTo: "/reset-password" })
        .expect(200);
      expect(await prisma.verification.count({ where: { value: userId } })).toBeGreaterThan(0);
      // Better Auth also writes suffixed identifiers (e.g. "<phone>-request-password-reset").
      await prisma.verification.create({
        data: {
          identifier: `${email}-suffixed-by-a-library`,
          value: "123456:0",
          expiresAt: new Date(Date.now() + 300_000),
        },
      });
      /*
       * Content the user authored and vouched for. `TOMBSTONED_COLUMNS` being complete is proved
       * by the schema test below; this proves `eraseUser` actually *acts* on what is listed — a
       * future column could be added to the list and forgotten in the function, and both other
       * tests would still pass (ADR-0011, ADR-0014 decisions 4 and 6).
       */
      const authored = await prisma.rubric.create({
        data: {
          slug: `erase-rubric-${randomUUID().slice(0, 8)}`,
          name: "Written and reviewed by someone who then left",
          createdByUserId: userId,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
        },
      });
      await prisma.contentVersion.create({
        data: {
          entityType: "rubric",
          entityId: authored.id,
          version: 1,
          snapshot: {},
          changedByUserId: userId,
        },
      });

      await endGracePeriod(userId);

      const erasedAfter = new Date();
      expect(await eraseUser(prisma, storage, userId)).toBe(true);

      expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
      expect(await prisma.profile.count({ where: { userId } })).toBe(0);
      expect(await prisma.consentRecord.count({ where: { userId } })).toBe(0);
      expect(await prisma.account.count({ where: { userId } })).toBe(0);
      expect(await prisma.verification.count({ where: { value: userId } })).toBe(0);
      expect(
        await prisma.verification.count({ where: { identifier: { startsWith: email } } }),
      ).toBe(0);
      expect(await storage.size(cvFileKey ?? "")).toBeNull();

      // Kept rows now point at one tombstone that nothing links back to the user.
      expect(
        await prisma.auditLog.count({ where: { OR: [{ actorId: userId }, { targetId: userId }] } }),
      ).toBe(0);
      expect(await prisma.aiCallLog.count({ where: { userId } })).toBe(0);
      // Scoped to this erasure: the integration files share one database.
      const erased = await prisma.auditLog.findFirstOrThrow({
        where: { action: "user.erased", targetId: { not: null }, createdAt: { gte: erasedAfter } },
        orderBy: { createdAt: "desc" },
      });
      const tombstone = erased.targetId ?? "";
      expect(await prisma.userTombstone.count({ where: { id: tombstone } })).toBe(1);
      expect(
        await prisma.auditLog.count({
          where: { action: "user.deletion.requested", actorId: tombstone },
        }),
      ).toBe(1);
      expect(await prisma.aiCallLog.count({ where: { userId: tombstone } })).toBe(1);

      // The content stands; only the names behind it move to the tombstone.
      const kept = await prisma.rubric.findUniqueOrThrow({ where: { id: authored.id } });
      expect(kept.createdByUserId).toBe(tombstone);
      expect(kept.reviewedByUserId).toBe(tombstone);
      expect(kept.reviewedAt).not.toBeNull();
      expect(
        await prisma.contentVersion.count({
          where: { entityId: authored.id, changedByUserId: tombstone },
        }),
      ).toBe(1);
      await prisma.rubric.delete({ where: { id: authored.id } });

      // The email address is free again.
      expect((await signUpWithEmail(app, email)).cookie).toBeTruthy();
    });

    it("the sweep erases every account that is due", async () => {
      const first = await emailUser();
      const second = await phoneUser();
      for (const user of [first, second]) {
        await requestDeletion(user.cookie).expect(200);
        await endGracePeriod(user.userId);
      }
      const result = await app.get(AccountDeletionService).eraseDue();
      expect(result.failed).toBe(0);
      expect(
        await prisma.user.count({ where: { id: { in: [first.userId, second.userId] } } }),
      ).toBe(0);
    });

    it("purges expired verification codes, which hold phone numbers", async () => {
      const phone = uniqueNigerianMobile();
      const fresh = uniqueNigerianMobile();
      await prisma.verification.create({
        data: { identifier: phone, value: "123456:0", expiresAt: new Date(Date.now() - 1000) },
      });
      await prisma.verification.create({
        data: { identifier: fresh, value: "123456:0", expiresAt: new Date(Date.now() + 300_000) },
      });

      const deletion: AccountDeletionService = app.get(AccountDeletionService);
      await deletion.purgeExpiredVerifications();

      expect(await prisma.verification.count({ where: { identifier: phone } })).toBe(0);
      expect(await prisma.verification.count({ where: { identifier: fresh } })).toBe(1);
    });

    it("an admin can cancel during the grace period, but not after it", async () => {
      const { email, cookie, userId } = await emailUser();
      await requestDeletion(cookie).expect(200);

      await expect(
        cancelDeletion(prisma, { user: { email: email.toUpperCase() }, actor: { type: "system" } }),
      ).resolves.toEqual({ userId });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: userId } })).toMatchObject({
        deletedAt: null,
        deletionScheduledFor: null,
      });
      expect(
        await prisma.auditLog.count({
          where: { action: "user.deletion.cancelled", targetId: userId },
        }),
      ).toBe(1);
      expect((await signIn(email)).status).toBe(200);
      await expect(
        cancelDeletion(prisma, { user: { email }, actor: { type: "system" } }),
      ).rejects.toBeInstanceOf(DeletionNotCancellableError);

      // Requested again and past the grace period: too late to cancel.
      const fresh = sessionCookie(await signIn(email));
      await requestDeletion(fresh).expect(200);
      await endGracePeriod(userId);
      await expect(
        cancelDeletion(prisma, { user: { email }, actor: { type: "system" } }),
      ).rejects.toBeInstanceOf(DeletionNotCancellableError);
    });

    it("audit snapshots hold ids and enum values only, never personal data", async () => {
      // These rows outlive the account (attached to a tombstone) and are part of the export, so a
      // writer that logged an old email or phone number would break both promises at once.
      const rows = await prisma.auditLog.findMany({
        where: { OR: [{ before: { not: Prisma.DbNull } }, { after: { not: Prisma.DbNull } }] },
        take: 500,
        orderBy: { createdAt: "desc" },
      });
      expect(rows.length).toBeGreaterThan(0);
      const snapshots = JSON.stringify(rows.map((row) => [row.before, row.after]));
      expect(snapshots).not.toMatch(/@/);
      expect(snapshots).not.toMatch(/\+234/);
    });

    it("every user reference without a cascading foreign key is tombstoned", async () => {
      // Columns that look like user references (uuid, named *user_id, actor_id or target_id)...
      const candidates = await prisma.$queryRaw<{ table: string; column: string }[]>`
        SELECT c.table_name AS "table", c.column_name AS "column"
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.data_type = 'uuid'
          AND (c.column_name LIKE '%user_id' OR c.column_name LIKE '%\\_by' ESCAPE '\\'
               OR c.column_name IN ('actor_id', 'target_id'))`;
      // ...minus those that are foreign keys to users with ON DELETE CASCADE.
      const cascading = await prisma.$queryRaw<{ table: string; column: string }[]>`
        SELECT kcu.table_name AS "table", kcu.column_name AS "column"
        FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = rc.constraint_name AND kcu.table_schema = rc.constraint_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = rc.constraint_name AND ccu.table_schema = rc.constraint_schema
        WHERE rc.constraint_schema = 'public' AND ccu.table_name = 'users'
          AND rc.delete_rule = 'CASCADE'`;
      const key = (c: { table: string; column: string }) => `${c.table}.${c.column}`;
      const cascadingKeys = new Set(cascading.map(key));
      const unlinked = candidates
        .map(key)
        .filter((c) => !cascadingKeys.has(c))
        .sort();
      expect(unlinked).toEqual(TOMBSTONED_COLUMNS.map(key).sort());
    });
  });
});

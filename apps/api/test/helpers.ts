import { randomInt, randomUUID } from "node:crypto";
import type { LoggerService } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { CONSENT_VERSIONS, type ConsentType } from "@readi/shared-types";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { parseEnv } from "../src/config/env";
import type { PrismaService } from "../src/prisma/prisma.service";

export interface TestAppOptions {
  env?: Record<string, string>;
  overrides?: [token: unknown, value: unknown][];
  logger?: LoggerService;
}

/** Builds the app exactly as main.ts does (no body parser, then configureApp), against test services. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  // A queue namespace per app, so test files running in parallel never take each other's jobs.
  const env = parseEnv({ ...process.env, QUEUE_PREFIX: `test-${randomUUID()}`, ...options.env });
  let builder = Test.createTestingModule({ imports: [AppModule.register(env)] });
  for (const [token, value] of options.overrides ?? []) {
    builder = builder.overrideProvider(token).useValue(value);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    ...(options.logger ? { logger: options.logger } : {}),
  });
  configureApp(app);
  await app.init();
  return app;
}

// Unique per call, so tests are independent of each other and of earlier runs (rate-limit windows).
export const uniqueEmail = () => `test-${randomUUID()}@example.com`;
export const uniqueIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
/** A valid Nigerian mobile number in E.164 (MTN 0803 range). */
export const uniqueNigerianMobile = () => `+234803${String(randomInt(1_000_000, 9_999_999))}`;

export const PASSWORD = "correct horse battery staple";

/** Headers the web proxy adds: a (unique) client IP plus the shared secret that makes it trusted. */
export function viaProxy(ip = uniqueIp()): Record<string, string> {
  return {
    "x-readi-client-ip": ip,
    "x-readi-proxy-secret": process.env.WEB_PROXY_SECRET ?? "",
    origin: "http://localhost:3002",
  };
}

/**
 * The header the AI worker calls back with (M5, ADR-0019). The **second direction** of authentication:
 * until voice mode the worker was only ever called, and `/api/internal/...` is reached with the same
 * shared token travelling the other way (`ServiceTokenGuard`).
 *
 * Read from the environment for the same reason `viaProxy` reads `WEB_PROXY_SECRET`: the test proves
 * the guard accepts the configured token, which is a weaker claim than it looks unless the token is
 * genuinely the one the app was built with.
 */
export function viaService(): Record<string, string> {
  return { authorization: `Bearer ${process.env.AI_WORKER_TOKEN ?? ""}` };
}

/**
 * The environment a test app needs to serve voice at all, with the docker-compose dev server's own
 * LiveKit credentials — which are public, in `infra/docker-compose.yml`, and not secrets.
 *
 * A test that also passes `[VOICE_ROOM, new FakeVoiceRoom()]` never reaches LiveKit; these are what get
 * `VOICE_ENABLED=true` past `parseEnv`, which refuses half-configured voice on purpose.
 */
export const VOICE_ENV: Record<string, string> = {
  VOICE_ENABLED: "true",
  LIVEKIT_URL: "ws://127.0.0.1:7880",
  LIVEKIT_API_KEY: "devkey",
  LIVEKIT_API_SECRET: "secret",
};

/**
 * Grants one consent type at its **current** version, the way the consent screen would.
 *
 * `CONSENT_VERSIONS[type]` rather than 1: a decision recorded against older wording is deliberately
 * not a grant (`isCurrentGrant`), so a fixture that wrote 1 would silently stop granting anything the
 * next time a text changed — which is precisely what `audio_processing` did in M5.
 */
export async function grantConsent(
  prisma: PrismaService,
  userId: string,
  type: ConsentType,
): Promise<void> {
  await prisma.consentRecord.create({
    data: { userId, type, granted: true, version: CONSENT_VERSIONS[type] },
  });
}

/** Session cookie header from a Better Auth response (attributes stripped). */
export function sessionCookie(response: request.Response): string {
  const raw = response.headers["set-cookie"] as unknown as string[] | undefined;
  const cookies = (raw ?? []).map((c) => c.split(";")[0]).filter((c): c is string => Boolean(c));
  if (cookies.length === 0) throw new Error(`no cookie in response (HTTP ${response.status})`);
  return cookies.join("; ");
}

export async function signUpWithEmail(
  app: NestExpressApplication,
  email = uniqueEmail(),
  extra: Record<string, unknown> = {},
): Promise<{ email: string; cookie: string }> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/sign-up/email")
    .set(viaProxy())
    .send({ email, password: PASSWORD, name: "Test Candidate", ...extra });
  if (response.status !== 200)
    throw new Error(`sign-up failed: ${response.status} ${response.text}`);
  return { email, cookie: sessionCookie(response) };
}

export interface MailboxEntry {
  channel: string;
  to: string;
  subject?: string;
  body: string;
}

export async function readMailbox(
  app: NestExpressApplication,
  to: string,
): Promise<MailboxEntry[]> {
  const response = await request(app.getHttpServer()).get("/api/dev/mailbox").query({ to });
  if (response.status !== 200) throw new Error(`mailbox read failed: ${response.status}`);
  return response.body as MailboxEntry[];
}

/** Requests an OTP for `phone` and returns the code from the dev mailbox. */
export async function requestOtp(app: NestExpressApplication, phone: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/auth/phone-number/send-otp")
    .set(viaProxy())
    .send({ phoneNumber: phone });
  if (response.status !== 200)
    throw new Error(`send-otp failed: ${response.status} ${response.text}`);
  const [latest] = await readMailbox(app, phone);
  const code = latest?.body.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("no OTP in the dev mailbox");
  return code;
}

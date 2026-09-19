// Server-side Sentry. Loaded only when SENTRY_DSN is set, so it costs nothing when disabled.
import type { Instrumentation } from "next";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // sendDefaultPii does not cover request bodies, and every /api/* call is proxied through this
    // server, so passwords, phone numbers and CV content pass through it (CLAUDE.md §5).
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" })],
    beforeSend: scrubSentryEvent,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};

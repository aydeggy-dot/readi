// Server-side Sentry. Loaded only when SENTRY_DSN is set, so it costs nothing when disabled.
import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    sendDefaultPii: false, // never send emails, phone numbers, transcripts (CLAUDE.md §5)
    tracesSampleRate: 0,
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};

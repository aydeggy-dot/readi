// Imported first by main.ts: Sentry must initialise before other modules load.
import * as Sentry from "@sentry/nestjs";
import { loadEnvFile } from "./config/env";
import { scrubSentryEvent } from "./logging/sentry-scrub";

loadEnvFile();

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // sendDefaultPii does not cover request bodies: the HTTP integration captures 10 KB of every
    // incoming body by default, which here means passwords, phone numbers and CV content
    // (CLAUDE.md §5). Turn the capture off, and scrub whatever still reaches beforeSend.
    integrations: [Sentry.httpIntegration({ maxIncomingRequestBodySize: "none" })],
    beforeSend: scrubSentryEvent,
  });
}

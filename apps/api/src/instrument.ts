// Imported first by main.ts: Sentry must initialise before other modules load.
import * as Sentry from "@sentry/nestjs";
import { loadEnvFile } from "./config/env";

loadEnvFile();

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    sendDefaultPii: false, // never send emails, phone numbers, transcripts (CLAUDE.md §5)
    tracesSampleRate: 0,
  });
}

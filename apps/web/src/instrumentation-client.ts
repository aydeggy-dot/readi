// Browser-side Sentry and PostHog. Each SDK is fetched only when its key is configured, so neither
// adds to the initial JS on low-bandwidth connections when disabled.
import { clientEnv } from "@/env/client";
import { scrubSentryEvent } from "@/lib/sentry-scrub";

const { sentryDsn, posthogKey, posthogHost } = clientEnv;

if (sentryDsn) {
  const dsn = sentryDsn;
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({ dsn, sendDefaultPii: false, tracesSampleRate: 0, beforeSend: scrubSentryEvent }),
  );
}

if (posthogKey) {
  const key = posthogKey;
  void import("posthog-js").then(({ default: posthog }) =>
    posthog.init(key, {
      api_host: posthogHost,
      person_profiles: "identified_only",
      // No autocapture or session recording: they can pick up transcript text and PII (spec §9).
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: "history_change",
    }),
  );
}

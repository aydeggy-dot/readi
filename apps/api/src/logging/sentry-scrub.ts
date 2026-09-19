/**
 * `sendDefaultPii: false` does NOT stop the JavaScript SDK sending request bodies: the HTTP
 * integration buffers up to 10 KB by default and `requestDataIntegration` always attaches whatever
 * is on the scope (verified in @sentry/core 10.72 — `integrations/http/server-subscription.js`
 * gates only on `maxRequestBodySize`, and `integrations/requestdata.js` sets `data: true`
 * unconditionally). Those bodies carry passwords, emails, phone numbers and CV content, so the
 * integration is configured with `maxIncomingRequestBodySize: "none"` and every event also passes
 * through `scrubSentryEvent` — belt and braces, because one missed option would leak candidate data.
 *
 * The Python worker's equivalent is `_init_sentry` in apps/ai-worker/readi_worker/main.py.
 */

/** Request headers that must never reach Sentry, whatever the SDK decides to attach. */
const SECRET_HEADERS = ["cookie", "authorization", "x-readi-proxy-secret", "x-readi-client-ip"];

interface SentryLikeEvent {
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Removes request bodies, cookies and secret headers from an event before it is sent. */
export function scrubSentryEvent<T extends SentryLikeEvent>(event: T): T {
  const request = event.request;
  if (!request) return event;
  delete request.data;
  delete request.cookies;
  if (request.headers) {
    for (const name of Object.keys(request.headers)) {
      if (SECRET_HEADERS.includes(name.toLowerCase())) delete request.headers[name];
    }
  }
  return event;
}

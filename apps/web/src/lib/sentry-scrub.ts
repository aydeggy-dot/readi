// Twin of apps/api/src/logging/sentry-scrub.ts. `sendDefaultPii: false` does not stop the SDK
// attaching request bodies, and every /api/* call passes through this Node server, so the same
// bodies (passwords, phone numbers, CV content) are visible here (CLAUDE.md §5).

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

import { createAuthClient } from "better-auth/client";
import { phoneNumberClient } from "better-auth/client/plugins";

let client: ReturnType<typeof create> | undefined;

function create() {
  // Same origin: the web app proxies /api/auth/* to the API, so cookies stay first-party (ADR-0009).
  return createAuthClient({ baseURL: window.location.origin, plugins: [phoneNumberClient()] });
}

/** The Better Auth browser client. Call from event handlers only (it needs `window`). */
export function authClient() {
  client ??= create();
  return client;
}

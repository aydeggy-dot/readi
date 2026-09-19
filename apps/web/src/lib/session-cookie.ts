/** Better Auth's session cookie with our prefix (ADR-0009); `__Secure-` is added over HTTPS. */
const SESSION_COOKIES = ["readi.session_token", "__Secure-readi.session_token"];

/**
 * Whether the request carries a session cookie at all. Cheap routing hint for proxy.ts only: the
 * cookie may be expired or forged, so pages still resolve the session with the API.
 */
export function hasSessionCookie(cookieNames: Iterable<string>): boolean {
  for (const name of cookieNames) if (SESSION_COOKIES.includes(name)) return true;
  return false;
}

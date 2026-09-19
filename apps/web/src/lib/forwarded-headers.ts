/** Header the API trusts for the client IP, and the secret proving this proxy set it (ADR-0009). */
export const CLIENT_IP = "x-readi-client-ip";
export const PROXY_SECRET = "x-readi-proxy-secret";

/**
 * Request headers forwarded to the API through the /api rewrite. Client-supplied values of our own
 * headers are always dropped; the client IP is taken only from the hosting edge's trusted header.
 */
export function forwardedHeaders(
  incoming: Headers,
  config: { clientIpHeader?: string; secret?: string },
): Headers {
  const headers = new Headers(incoming);
  headers.delete(CLIENT_IP);
  headers.delete(PROXY_SECRET);
  if (!config.secret) return headers;

  headers.set(PROXY_SECRET, config.secret);
  const ip = config.clientIpHeader ? incoming.get(config.clientIpHeader)?.trim() : undefined;
  // One address only: a comma means a chain, which this header must never carry.
  if (ip && !ip.includes(",")) headers.set(CLIENT_IP, ip);
  return headers;
}

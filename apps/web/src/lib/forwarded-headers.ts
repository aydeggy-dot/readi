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
  // One address only: a comma means a chain, which this header must never carry. The shape is
  // checked here rather than relying on the API's auth library to reject anything else — this is
  // the trust boundary ADR-0009 describes, and what it forwards ends up stored on sessions.
  if (ip && isSingleIpAddress(ip)) headers.set(CLIENT_IP, ip);
  return headers;
}

/** A single IPv4 or IPv6 address, with nothing else in the header. */
export function isSingleIpAddress(value: string): boolean {
  if (value.length > 45 || /[\s,]/.test(value)) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (ipv4) return ipv4.slice(1).every((part) => Number(part) <= 255 && !/^0\d/.test(part));
  // IPv6: hex groups, optionally shortened once with "::" (zone ids and ports are not accepted).
  return /^(?=.*::|.*(?::[0-9a-f]{1,4}){7})(?!.*::.*::)[0-9a-f:]{2,45}$/i.test(value);
}

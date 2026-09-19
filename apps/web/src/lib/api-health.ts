import { HealthResponse } from "@readi/shared-types";

export type ApiHealth =
  { reachable: true; latency_ms: number; health: HealthResponse } | { reachable: false };

/**
 * Fetches GET /health from the API (server-side). The API answers 503 with a valid body when a
 * dependency is down, so the body is parsed regardless of status; anything else counts as unreachable.
 */
export async function fetchApiHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<ApiHealth> {
  const start = performance.now();
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = HealthResponse.safeParse(await response.json());
    if (!parsed.success) return { reachable: false };
    return {
      reachable: true,
      latency_ms: Math.round(performance.now() - start),
      health: parsed.data,
    };
  } catch {
    return { reachable: false };
  }
}

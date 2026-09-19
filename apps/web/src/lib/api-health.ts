import { HealthResponse } from "@readi/shared-types";

export type ApiHealth = { reachable: true; health: HealthResponse } | { reachable: false };

/**
 * Fetches GET /health from the API (server-side). The API answers 503 with a valid body when a
 * dependency is down, so the body is parsed regardless of status; anything else counts as unreachable.
 */
export async function fetchApiHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): Promise<ApiHealth> {
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const parsed = HealthResponse.safeParse(await response.json());
    return parsed.success ? { reachable: true, health: parsed.data } : { reachable: false };
  } catch {
    return { reachable: false };
  }
}

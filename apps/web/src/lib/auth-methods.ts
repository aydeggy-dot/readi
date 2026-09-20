import type { AuthMethodsResponse } from "@readi/shared-types";
import { createApiClient } from "@readi/api-client";
import { serverEnv } from "@/env/server";

/** Which optional sign-in methods the API has configured. Fails closed (hides the buttons). */
export async function getAuthMethods(): Promise<AuthMethodsResponse> {
  try {
    const api = createApiClient({ baseUrl: serverEnv.API_INTERNAL_URL });
    const { data } = await api.GET("/api/auth-methods", { signal: AbortSignal.timeout(3000) });
    return data ?? { google: false };
  } catch {
    return { google: false };
  }
}

// Server-only data loaders shared by onboarding and profile pages.
import type { ConsentStatus, ProfileResponse } from "@readi/shared-types";
import { serverApi } from "./session";

export async function getProfile(): Promise<ProfileResponse | null> {
  const { data, response } = await (await serverApi()).GET("/api/me/profile");
  if (response.status === 404) return null;
  if (!data) throw new Error(`GET /api/me/profile failed with HTTP ${response.status}`);
  return data;
}

export async function getConsents(): Promise<ConsentStatus[]> {
  const { data, response } = await (await serverApi()).GET("/api/me/consents");
  if (!data) throw new Error(`GET /api/me/consents failed with HTTP ${response.status}`);
  return data.consents;
}

/** Today's date (UTC) as YYYY-MM-DD: the earliest target interview date the form offers. */
export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

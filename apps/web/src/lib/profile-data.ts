// Server-only data loaders shared by onboarding and profile pages.
import type {
  CandidateCareerRole,
  ConsentStatus,
  CvResponse,
  ProfileResponse,
} from "@readi/shared-types";
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

export async function getCv(): Promise<CvResponse> {
  const { data, response } = await (await serverApi()).GET("/api/me/cv");
  if (!data) throw new Error(`GET /api/me/cv failed with HTTP ${response.status}`);
  return data;
}

/**
 * The catalogue a candidate chooses from: published roles only, each with the levels it is hired
 * at and the stacks it offers (ADR-0015). Labels live on the rows — a database-managed role has no
 * message key — so every page that shows a role or a level by name reads this.
 */
export async function getCareerRoles(): Promise<CandidateCareerRole[]> {
  const { data, response } = await (await serverApi()).GET("/api/content/career-roles");
  if (!data) throw new Error(`GET /api/content/career-roles failed with HTTP ${response.status}`);
  return data.roles;
}

/** Today's date (UTC) as YYYY-MM-DD: the earliest target interview date the form offers. */
export const todayIsoDate = () => new Date().toISOString().slice(0, 10);

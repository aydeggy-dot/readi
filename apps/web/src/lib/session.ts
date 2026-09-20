// Server-only: resolves the signed-in user for server components (ADR-0012).
import type { MeResponse } from "@readi/shared-types";
import { createApiClient } from "@readi/api-client";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { serverEnv } from "@/env/server";
import { nextOnboardingPath } from "./navigation";

/** API client for server components, acting as the user whose request is being rendered. */
export async function serverApi() {
  const cookie = (await headers()).get("cookie") ?? "";
  return createApiClient({ baseUrl: serverEnv.API_INTERNAL_URL, headers: { cookie } });
}

/** The signed-in user, or null. Cached per request, so layouts and pages share one API call. */
export const getMe = cache(async (): Promise<MeResponse | null> => {
  const api = await serverApi();
  const { data, response } = await api.GET("/api/me");
  if (response.status === 401) return null;
  if (!data) throw new Error(`GET /api/me failed with HTTP ${response.status}`);
  return data;
});

export async function requireUser(): Promise<MeResponse> {
  const me = await getMe();
  if (!me) redirect("/login");
  return me;
}

/** A signed-in user who has finished onboarding; anyone else is sent to their next step. */
export async function requireOnboarded(): Promise<MeResponse> {
  const me = await requireUser();
  const next = nextOnboardingPath(me.onboarding);
  if (next) redirect(next);
  return me;
}

/** Admin pages answer 404 to everyone else, so their existence is not advertised. */
export async function requireAdmin(): Promise<MeResponse> {
  const me = await requireUser();
  if (me.role !== "admin") notFound();
  return me;
}

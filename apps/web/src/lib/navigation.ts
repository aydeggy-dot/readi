import type { OnboardingState } from "@readi/shared-types";

/** Where signed-in users land by default. */
export const HOME_PATH = "/home";

/**
 * A post-login redirect target taken from the query string, or the fallback. Only same-site paths
 * are allowed (no open redirects): "/x" yes; "//evil.test", "/\\evil.test", "https://…" no.
 */
export function safeNextPath(next: string | null | undefined, fallback = HOME_PATH): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  if (next === "/api" || next.startsWith("/api/")) return fallback;
  return next;
}

/** The onboarding step the user still has to do, or null once onboarding is complete. */
export function nextOnboardingPath(state: OnboardingState): string | null {
  if (!state.profile_completed) return "/onboarding/profile";
  if (!state.completed_at) return "/onboarding/consent";
  return null;
}

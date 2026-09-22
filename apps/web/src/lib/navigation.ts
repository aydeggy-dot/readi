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

/** A YYYY-MM-DD from a query parameter, or null if it is anything else. */
export function isoDateParam(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)
    ? value
    : null;
}

/**
 * Whether a navigation link points at the page being shown, so it can be marked `aria-current`.
 * A link owns its section: /profile is current on /profile/edit, and on /profile/cv. Exactness
 * matters for the roots — /home must not light up for every path, and "/" only for "/" itself.
 *
 * `exact` is for a link that sits beside one of its own children: /admin and /admin/content are
 * two places, not a section and its page, so only one of them may be current at a time.
 */
export function isCurrentPath(
  pathname: string | null,
  href: string,
  options: { exact?: boolean } = {},
): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const target = href.length > 1 ? href.replace(/\/+$/, "") : href;
  if (path === target) return true;
  if (options.exact) return false;
  return target !== "/" && path.startsWith(`${target}/`);
}

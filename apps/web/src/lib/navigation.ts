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

/**
 * The onboarding step the user still has to do, or null once there is nothing left to ask.
 *
 * **It routes on the decisions, not on `completed_at`** (2026-09-27). Routing on `completed_at` meant
 * that an account which finished onboarding was never sent back for a consent type that did not exist
 * when it onboarded — so `transcript_review` joined `allDecided` in M4 phase 0 precisely to be asked
 * once of everybody, and was asked of nobody. ADR-0017's promise was in the code and not in the
 * product, and the first paid run found it because the interview intro correctly omitted a clause for
 * a consent the owner had never been offered.
 *
 * Reading `consents_completed` instead also makes a future `CONSENT_VERSIONS` bump re-ask, which is
 * the same promise in its general form: a decision on wording nobody has seen is not a decision.
 *
 * `completed_at` is still what `complete()` sets and is still on the contract — it says onboarding
 * *happened*, which is a different question from whether anything is outstanding, and it is why
 * `complete()` can stay idempotent while this sends somebody back.
 */
export function nextOnboardingPath(state: OnboardingState): string | null {
  if (!state.profile_completed) return "/onboarding/profile";
  if (!state.consents_completed) return "/onboarding/consent";
  return null;
}

/**
 * Where `/onboarding/consent` sends a visitor, or null to show the form.
 *
 * It is a pure function beside `nextOnboardingPath` because **the two compose into a redirect loop if
 * they disagree**, and that is not something a comment can hold. The consent page used to bounce
 * anybody with `completed_at` to `/profile/consent`; `/profile/consent` calls `requireOnboarded()`,
 * which calls `nextOnboardingPath`. So the moment this function routes on a *different* fact from that
 * one, an onboarded account with an undecided consent ping-pongs between the two screens for ever —
 * which is exactly what the one-line fix would have shipped on its own.
 *
 * The invariant, asserted exhaustively over every state in `navigation.test.ts`: this may not send
 * somebody to `/profile/consent` from a state that `nextOnboardingPath` answers with
 * `/onboarding/consent`. Both read `consents_completed`, so it holds by construction rather than by
 * care.
 */
export function consentStepPath(state: OnboardingState): string | null {
  // The earlier step first: consent decisions are recordable without a profile, so a state with
  // decisions and no profile must still be sent back rather than waved through.
  if (!state.profile_completed) return "/onboarding/profile";
  // Nothing left to ask, so this is the wrong screen — the editable one is in the profile.
  if (state.consents_completed) return "/profile/consent";
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

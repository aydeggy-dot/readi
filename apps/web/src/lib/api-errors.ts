import { t } from "@/i18n";

/** A failed API call, ready to show: the message, and whether the session is the reason. */
export interface ApiFailure {
  message: string;
  /** The session ended; retrying cannot work until the user signs in again. */
  signedOut: boolean;
}

/**
 * Translated copy for a failed API call. `overrides` handles codes a screen explains in its own
 * words (e.g. 422 for a file we could not read). Without the 401 case a long-open page — the CV
 * editor especially — shows "Something went wrong" for ever, with no hint that signing in fixes it.
 */
export function apiFailure(status: number, overrides: Record<number, string> = {}): ApiFailure {
  const override = overrides[status];
  if (override) return { message: override, signedOut: false };
  if (status === 401) return { message: t("common.errors.signedOut"), signedOut: true };
  if (status === 429) return { message: t("common.errors.rateLimited"), signedOut: false };
  return { message: t("common.errors.generic"), signedOut: false };
}

/** The request never reached the API. */
export const networkFailure = (): ApiFailure => ({
  message: t("common.errors.network"),
  signedOut: false,
});

import { errorCode } from "@readi/api-client";
import { t } from "@/i18n";

/**
 * The catalogue's refusals on the career profile form (ADR-0012, ADR-0015).
 *
 * The form is built from the same catalogue the API checks against, so reaching one of these means
 * the request did not come from the form as it stands — a tab left open while a role was retired,
 * an old bookmark, or a hand-made request. Each one says which half of the choice went stale, so
 * the candidate knows to pick again rather than to try again.
 */
const MESSAGES: Record<string, () => string> = {
  role_not_found: () => t("profileForm.errors.roleGone"),
  level_not_found: () => t("profileForm.errors.levelGone"),
  level_not_offered_for_role: () => t("profileForm.errors.levelNotOffered"),
};

/** Translated copy for a profile API error body, or undefined if its code is not one of ours. */
export function profileErrorMessage(body: unknown): string | undefined {
  const code = errorCode(body);
  return code ? MESSAGES[code]?.() : undefined;
}

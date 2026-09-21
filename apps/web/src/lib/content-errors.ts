import { errorCode } from "@readi/api-client";
import { t } from "@/i18n";

/**
 * The CMS's refusals, in the CMS's words. The API answers with a stable `code` and an English
 * message; the web app never shows the latter (ADR-0012), so every code the content endpoints can
 * return is mapped here — and anything unmapped falls back to the generic failure copy.
 */
const MESSAGES: Record<string, () => string> = {
  content_slug_taken: () => t("admin.content.errors.slugTaken"),
  rubric_weights_invalid: () => t("admin.content.errors.weights"),
  question_rubric_not_published: () => t("admin.content.errors.rubricNotPublished"),
  track_has_no_modules: () => t("admin.content.errors.trackHasNoModules"),
  track_already_published: () => t("admin.content.errors.trackAlreadyPublished"),
  content_transition_forbidden: () => t("admin.content.errors.transitionForbidden"),
  content_transition_invalid: () => t("admin.content.errors.transitionInvalid"),
  track_not_found: () => t("admin.content.errors.notFound"),
  lesson_not_found: () => t("admin.content.errors.notFound"),
  question_not_found: () => t("admin.content.errors.notFound"),
  rubric_not_found: () => t("admin.content.errors.notFound"),
  module_not_found: () => t("admin.content.errors.notFound"),
  topic_not_found: () => t("admin.content.errors.notFound"),
};

/** Translated copy for a content API error body, or undefined if its code is not one of ours. */
export function contentErrorMessage(body: unknown): string | undefined {
  const code = errorCode(body);
  return code ? MESSAGES[code]?.() : undefined;
}

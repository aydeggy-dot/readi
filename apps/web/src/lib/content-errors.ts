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
  content_unreviewed_ai_draft: () => t("admin.content.errors.unreviewedAiDraft"),
  content_not_unreviewed: () => t("admin.content.errors.notUnreviewed"),
  content_edit_needs_admin: () => t("admin.content.errors.editNeedsAdmin"),
  content_cursor_invalid: () => t("admin.content.errors.cursorInvalid"),
  content_version_not_found: () => t("admin.content.errors.versionNotFound"),
  // The catalogue (ADR-0015).
  career_role_has_no_published_level: () => t("admin.content.errors.roleHasNoPublishedLevel"),
  role_in_use: () => t("admin.content.errors.roleInUse"),
  level_in_use: () => t("admin.content.errors.levelInUse"),
  stack_in_use: () => t("admin.content.errors.stackInUse"),
  question_has_no_published_role: () => t("admin.content.errors.questionHasNoPublishedRole"),
  question_has_no_published_level: () => t("admin.content.errors.questionHasNoPublishedLevel"),
  question_has_no_published_stack: () => t("admin.content.errors.questionHasNoPublishedStack"),
  career_role_not_found: () => t("admin.content.errors.notFound"),
  career_level_not_found: () => t("admin.content.errors.notFound"),
  /*
   * The 400s from the slug resolver, raised when a track or question names a catalogue row that is
   * not there — the stale-tab case. They are separate codes from the 404s above (`stack_not_found`
   * is both, which is why it says "not in the catalogue any more" rather than "no longer exists").
   * Without these three the CMS fell back to "Check this field", against ADR-0012 and ADR-0015.
   */
  role_not_found: () => t("admin.content.errors.roleGone"),
  level_not_found: () => t("admin.content.errors.levelGone"),
  stack_not_found: () => t("admin.content.errors.stackGone"),
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

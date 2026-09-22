import { t } from "@/i18n";

/**
 * What to say when the API refuses one of the profile form's catalogue choices (ADR-0012,
 * ADR-0015).
 *
 * The form is built from the same catalogue the API checks against, so a refusal on one of these
 * three fields does not mean "you typed something wrong" — it means the catalogue moved while the
 * page was open: a role retired, a level withdrawn, a stack variant dropped. The copy says which
 * choice went stale so the candidate knows to pick again rather than to try again.
 *
 * `ProfilesService` answers with **field errors**, not coded `ApiError`s, because a form needs to
 * know which field to mark (its own comment says so). So this maps a field name, not a code — the
 * map of codes that stood here until M2.5 phase 4 could never match a response.
 */
const CATALOGUE_FIELDS: Record<string, () => string> = {
  target_role: () => t("profileForm.errors.roleGone"),
  level: () => t("profileForm.errors.levelGone"),
  target_stack: () => t("profileForm.errors.stackGone"),
};

/** Translated copy for a field the API refused: catalogue-specific where we have it. */
export function profileFieldMessage(field: string): string {
  if (field === "target_date") return t("profileForm.errors.datePast");
  return CATALOGUE_FIELDS[field]?.() ?? t("common.errors.invalidField");
}

/** True for the fields whose only failure mode is a catalogue that moved under the form. */
export const isCatalogueField = (field: string): boolean => field in CATALOGUE_FIELDS;

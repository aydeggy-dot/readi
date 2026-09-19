// Plain values shared by the Zod contracts and browser code. This module must not import Zod (or
// anything else): client components import it through "@readi/shared-types/constants" (ADR-0001).

/** RBAC roles (spec §4.8). `org_admin` is reserved for P2 and not accepted yet. */
export const ROLES = ["candidate", "content_expert", "admin"] as const;

/** How the account was created (spec §6.1 `User.signup_method`). */
export const SIGNUP_METHODS = ["email", "google", "phone"] as const;

/** Target roles at MVP (spec §3). */
export const TARGET_ROLES = ["frontend", "backend", "qa"] as const;

/** Experience levels at MVP (spec §3). */
export const EXPERIENCE_LEVELS = ["intern_junior", "mid"] as const;

/** Target company types (spec §4.1). */
export const TARGET_COMPANY_TYPES = [
  "local_startup",
  "enterprise_bank_telco",
  "remote_foreign",
  "big_tech",
] as const;

/** Password length rules for email + password accounts (enforced by the API's auth config). */
export const PASSWORD_LIMITS = { minLength: 10, maxLength: 128 } as const;

export const PROFILE_LIMITS = {
  nameMaxLength: 80,
  yearsExperienceMax: 50,
  stackMaxItems: 15,
  stackItemMaxLength: 40,
} as const;

/** Consent types (spec §4.1, CLAUDE.md "Data & privacy"). */
export const CONSENT_TYPES = [
  "audio_processing",
  "recording_storage",
  "camera_coaching",
  "marketing",
] as const;

/**
 * Current version of each consent text. Bump a version whenever its wording changes materially and
 * add the new copy to the web app's messages (`consent.types.<type>.v<version>`); a web test fails
 * if the copy for a current version is missing. Decisions recorded against an older version stay
 * valid history but no longer count as consent to the current text.
 */
export const CONSENT_VERSIONS = {
  audio_processing: 1,
  recording_storage: 1,
  camera_coaching: 1,
  marketing: 1,
} as const satisfies Record<(typeof CONSENT_TYPES)[number], number>;

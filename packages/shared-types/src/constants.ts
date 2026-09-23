// Plain values shared by the Zod contracts and browser code. This module must not import Zod (or
// anything else): client components import it through "@readi/shared-types/constants" (ADR-0001).

/** RBAC roles (spec §4.8). `org_admin` is reserved for P2 and not accepted yet. */
export const ROLES = ["candidate", "content_expert", "admin"] as const;

/** How the account was created (spec §6.1 `User.signup_method`). */
export const SIGNUP_METHODS = ["email", "google", "phone"] as const;

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
  /**
   * The free-text list of what the candidate knows — `technologies`, not `stack` (ADR-0015). The
   * curated variant they are interviewing for is `target_stack`, a catalogue slug; these two were
   * both called "stack" until M2.5, which is how a field meaning "React, Docker, Postgres" and a
   * field meaning "React + TypeScript" ended up sharing a name.
   */
  technologiesMaxItems: 15,
  technologyMaxLength: 40,
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

/** CV uploads (spec §4.1): PDF or DOCX, at most 5 MB. */
export const CV_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const CV_MAX_BYTES = 5 * 1024 * 1024;

export const CV_STATUSES = ["none", "processing", "parsed", "unreadable", "failed"] as const;

/** Limits on parsed CV content (applied to LLM output and to candidate edits alike). */
export const PARSED_CV_LIMITS = {
  skills: 60,
  skillLength: 60,
  projects: 15,
  experience: 20,
  gaps: 10,
  titleLength: 120,
  textLength: 600,
  gapLength: 300,
  technologies: 15,
} as const;

/**
 * Account deletion (ADR-0011): the word typed to confirm, the grace period before personal data is
 * erased, and how recently the user must have signed in to ask for it.
 */
export const ACCOUNT_DELETION = {
  confirmation: "DELETE",
  graceDays: 7,
  recentSignInMinutes: 15,
} as const;

/** Data export (ADR-0011): how long the CV download link in an export stays valid. */
export const DATA_EXPORT_CV_LINK_MINUTES = 15;

// -----------------------------------------------------------------------------------------------
// Learning content (spec §4.2, §4.8; ADR-0014).

/**
 * The content workflow. Only `published` content reaches candidates; `retired` is withdrawn
 * without being deleted, because sessions and reports still reference it.
 */
export const CONTENT_STATUSES = ["draft", "in_review", "published", "retired"] as const;

/** What kind of answer a question asks for (spec §4.2; `test_design` and `scenario` are QA's). */
export const QUESTION_TYPES = ["behavioral", "technical", "scenario", "test_design"] as const;

/** Entities that carry version history, in `content_versions.entity_type`. */
export const CONTENT_ENTITY_TYPES = [
  "track",
  "module",
  "lesson",
  "question",
  "rubric",
  "career_role",
  "career_level",
  "stack",
] as const;

/** Why a candidate flagged a question (spec §6.1 `ContentFlag`). */
export const CONTENT_FLAG_REASONS = [
  "unclear",
  "incorrect",
  "duplicate",
  "offensive",
  "other",
] as const;

export const CONTENT_FLAG_STATUSES = ["open", "reviewing", "resolved", "rejected"] as const;

/** Slugs are the stable key seed files and URLs use: lowercase words joined by single hyphens. */
export const SLUG_PATTERN = "^[a-z0-9]+(?:-[a-z0-9]+)*$";

/** Difficulty is 1–5 (spec §6.1). */
export const DIFFICULTY_RANGE = { min: 1, max: 5 } as const;

/** A rubric's criterion weights must add up to exactly this (checked before publishing). */
export const RUBRIC_WEIGHT_TOTAL = 100;

/** The five rubric levels every criterion describes, 0 (absent) to 4 (excellent). */
export const RUBRIC_LEVELS = ["0", "1", "2", "3", "4"] as const;

/**
 * Who may move a piece of content where (spec §4.8, ADR-0014 decision 1). A content expert writes
 * and submits; only an admin publishes or retires.
 *
 * It lives here, with the other plain values, because two sides need the same table: the API
 * enforces it (`apps/api/src/content/content-workflow.ts`, which is still the guard), and the CMS
 * draws only the buttons that would work. A second copy in the web app would drift.
 */
export const CONTENT_TRANSITIONS = {
  submit: {
    from: ["draft"],
    to: "in_review",
    roles: ["content_expert", "admin"],
    /** The verb the audit log records, as `content.<entity>.<verb>`. */
    verb: "submitted",
  },
  return_to_draft: {
    from: ["in_review", "retired"],
    to: "draft",
    roles: ["content_expert", "admin"],
    verb: "returned_to_draft",
  },
  publish: { from: ["in_review"], to: "published", roles: ["admin"], verb: "published" },
  retire: { from: ["published"], to: "retired", roles: ["admin"], verb: "retired" },
} as const satisfies Record<
  string,
  {
    from: readonly (typeof CONTENT_STATUSES)[number][];
    to: (typeof CONTENT_STATUSES)[number];
    roles: readonly (typeof ROLES)[number][];
    verb: string;
  }
>;

/** The moves a role could make from a status, so the CMS draws only the buttons that work. */
export function availableTransitions(
  status: (typeof CONTENT_STATUSES)[number],
  role: (typeof ROLES)[number],
): (keyof typeof CONTENT_TRANSITIONS)[] {
  const names = Object.keys(CONTENT_TRANSITIONS) as (keyof typeof CONTENT_TRANSITIONS)[];
  return names.filter((name) => {
    const rule = CONTENT_TRANSITIONS[name];
    return (
      (rule.roles as readonly string[]).includes(role) &&
      (rule.from as readonly string[]).includes(status)
    );
  });
}

export const CONTENT_LIMITS = {
  slugMaxLength: 80,
  titleMaxLength: 140,
  summaryMaxLength: 400,
  /** Lesson bodies are markdown; long enough for a full lesson, short enough to render fast. */
  lessonBodyMaxLength: 20_000,
  lessonMinutesMax: 120,
  questionPromptMaxLength: 2_000,
  questionContextMaxLength: 4_000,
  subtopicMaxLength: 80,
  idealPoints: 10,
  idealPointMaxLength: 300,
  /**
   * Planned follow-ups: the probes the engine may ask when an answer has not covered a criterion
   * (owner's decision, 2026-09-23). House style is one per criterion the opening prompt does not
   * ask for, and a second only where a criterion genuinely scores two separable things — so this
   * leaves room for house style's five criteria at the per-criterion cap, rather than being a
   * number anybody writes up to.
   */
  plannedFollowUps: 10,
  /**
   * Two, not one, since the QA pilot: a criterion scoring two separable things needs a probe for
   * each, or half of it is scored and never asked. A third probe means the criterion should have
   * been split.
   */
  followUpsPerCriterion: 2,
  /** One sentence, as the interviewer would say it out loud. */
  followUpProbeMaxLength: 300,
  /** House style is 3–5 criteria; the contract leaves room without inviting a wall of them. */
  rubricCriteria: { min: 2, max: 8 },
  dimensionMaxLength: 80,
  criterionDescriptionMaxLength: 300,
  levelDescriptorMaxLength: 300,
  changeNoteMaxLength: 200,
  /** Seed-file notes from the drafter to the reviewing expert (`/content/seed`). */
  reviewerNotesMaxLength: 1_000,
  flagNoteMaxLength: 500,
  searchMaxLength: 100,
  pageSize: { default: 20, max: 100 },
  /** Keyset cursors are base64url of `{updated_at, id}`; this leaves room for both. */
  cursorMaxLength: 200,
  /**
   * How many catalogue roles and levels one question may be offered to (ADR-0015). These used to
   * be `.max(3)` and `.max(2)` — which were not limits at all, but the cardinalities of the two
   * enums. With roles as content there is no cardinality to borrow, so these are what they say:
   * a question serving seven roles is a question that has stopped being about any of them.
   */
  questionRoles: 6,
  questionLevels: 4,
  /**
   * How many stack variants one question may be tagged for. No tags at all is the common case and
   * means "general to the role"; the cap is here because a question offered to eight of a role's
   * variants is, in practice, a general question with a list attached.
   */
  questionStacks: 8,
} as const;

/**
 * The catalogue: career roles, the levels each offers, and the technology stacks a candidate can
 * be interviewed for (ADR-0015). Roles, levels and stacks are content, not enums, so these are
 * limits on a form rather than a closed set — a role with thirty stacks is a mistake, not a plan.
 */
export const CATALOGUE_LIMITS = {
  /** Levels one role offers, e.g. intern/junior, mid, senior. */
  roleLevels: 8,
  /** Stack variants one role offers, e.g. React + TypeScript, Vue / Nuxt. */
  roleStacks: 20,
  /** Orders levels against each other; a junior ranks below a senior. Sparse on purpose. */
  levelRankMax: 1_000,
} as const;

/**
 * Cosine similarity above which two questions are reported as near-duplicates (ADR-0006). A
 * warning, never a block: the API returns the matches and a human decides.
 */
export const CONTENT_DUPLICATE_THRESHOLD = 0.92;

/** Embedding vector length; must match the `vector(N)` column in the migration (ADR-0006). */
export const EMBEDDING_DIMENSIONS = 1024;

/**
 * One request to the worker's embedding route. `textMaxLength` comfortably holds a question's
 * prompt and its context together; `batchMax` keeps a re-embed run's requests small enough to
 * retry cheaply.
 */
export const EMBEDDING_LIMITS = { textMaxLength: 8_000, batchMax: 32 } as const;

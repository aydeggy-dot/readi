import type { ContentStatus, ContentTransition, Role } from "@readi/shared-types";

/**
 * The content workflow (spec §4.8, ADR-0014): who may move a piece of content where. A content
 * expert writes and submits; only an admin publishes or retires. The guard is a pure function so
 * the rules can be read, and tested, without a database.
 */

export interface TransitionRule {
  readonly from: readonly ContentStatus[];
  readonly to: ContentStatus;
  readonly roles: readonly Role[];
  /** The verb the audit log records, as `content.<entity>.<verb>`. */
  readonly verb: string;
}

export const TRANSITIONS: Readonly<Record<ContentTransition, TransitionRule>> = {
  submit: {
    from: ["draft"],
    to: "in_review",
    roles: ["content_expert", "admin"],
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
};

export type TransitionCheck =
  | { allowed: true; rule: TransitionRule }
  | { allowed: false; because: "role"; roles: readonly Role[] }
  | { allowed: false; because: "status"; from: readonly ContentStatus[] };

/**
 * Whether `role` may apply `transition` to content currently in `status`.
 *
 * The role is checked first on purpose: telling a content expert that a draft cannot be published
 * would send them to find an in-review one, when the answer is that publishing is not theirs to do.
 */
export function checkTransition(
  transition: ContentTransition,
  status: ContentStatus,
  role: Role,
): TransitionCheck {
  const rule = TRANSITIONS[transition];
  if (!rule.roles.includes(role)) return { allowed: false, because: "role", roles: rule.roles };
  if (!rule.from.includes(status)) return { allowed: false, because: "status", from: rule.from };
  return { allowed: true, rule };
}

/** The moves `role` could make from `status`, for a CMS that only draws the buttons that work. */
export function availableTransitions(status: ContentStatus, role: Role): ContentTransition[] {
  return (Object.keys(TRANSITIONS) as ContentTransition[]).filter(
    (transition) => checkTransition(transition, status, role).allowed,
  );
}

/** Content a candidate may be shown. Everything else is invisible outside the CMS (ADR-0014). */
export const isCandidateVisible = (status: ContentStatus): boolean => status === "published";

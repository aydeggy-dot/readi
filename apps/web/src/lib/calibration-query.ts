import { CONTENT_LIMITS } from "@readi/shared-types/constants";
import type { SearchParams } from "./content-query";

/**
 * The calibration queue's own URL state.
 *
 * Separate from `contentListQuery` rather than bent to fit it: the filters here are `scope` and
 * `flagged`, which the content lists have no idea about, and `ContentQuery` would have silently
 * dropped them while typechecking perfectly. The shape of the rule is the same one
 * `lib/content-query.ts` states — the URL is the state, and anything in it we do not recognise is
 * dropped rather than passed on to the API.
 */

const SCOPES = ["unreviewed", "mine", "all"] as const;
export type CalibrationScope = (typeof SCOPES)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CalibrationQuery {
  scope: CalibrationScope;
  flagged?: "true";
  role?: string;
  cursor?: string;
}

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export function calibrationQuery(params: SearchParams): CalibrationQuery {
  const scope = first(params.scope);
  const role = first(params.role);
  const cursor = first(params.cursor);
  return {
    // `unreviewed` is the default because a reviewer's next answer is the point of the screen.
    scope: (SCOPES as readonly string[]).includes(scope ?? "")
      ? (scope as CalibrationScope)
      : "unreviewed",
    flagged: first(params.flagged) === "true" ? "true" : undefined,
    role: role && role.length <= CONTENT_LIMITS.slugMaxLength && SLUG.test(role) ? role : undefined,
    cursor: cursor || undefined,
  };
}

/** Whether anything is narrowing the queue, so an empty screen can say which kind of empty. */
export function isNarrowed(query: CalibrationQuery): boolean {
  return query.scope !== "unreviewed" || Boolean(query.flagged ?? query.role);
}

/** The next page, keeping the filters. Keyset paging goes forward only, as everywhere else. */
export function nextHref(pathname: string, query: CalibrationQuery, cursor: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, cursor })) {
    if (value) params.set(key, value);
  }
  return `${pathname}?${params.toString()}`;
}

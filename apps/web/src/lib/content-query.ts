import {
  CONTENT_STATUSES,
  EXPERIENCE_LEVELS,
  QUESTION_TYPES,
  TARGET_ROLES,
} from "@readi/shared-types/constants";

/**
 * The CMS's list filters, read out of the URL (ADR-0014 lists are keyset-paged, never offset).
 *
 * The URL is the state: a filtered list can be linked to, reloaded and bookmarked, and the filter
 * bar is a plain GET form that works before any JavaScript arrives. Anything the URL carries that
 * is not a value we recognise is dropped rather than passed on to the API.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ContentQuery {
  status?: (typeof CONTENT_STATUSES)[number];
  q?: string;
  role?: (typeof TARGET_ROLES)[number];
  level?: (typeof EXPERIENCE_LEVELS)[number];
  type?: (typeof QUESTION_TYPES)[number];
  topic_id?: string;
  cursor?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const oneOf = <T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined => {
  const found = first(value);
  return found && (allowed as readonly string[]).includes(found) ? (found as T) : undefined;
};

/** Every filter the admin list endpoints understand; each endpoint ignores the ones it cannot use. */
export function contentListQuery(params: SearchParams): ContentQuery {
  const q = first(params.q)?.trim();
  const topicId = first(params.topic_id);
  const cursor = first(params.cursor);
  return {
    status: oneOf(params.status, CONTENT_STATUSES),
    q: q ? q.slice(0, 100) : undefined,
    role: oneOf(params.role, TARGET_ROLES),
    level: oneOf(params.level, EXPERIENCE_LEVELS),
    type: oneOf(params.type, QUESTION_TYPES),
    topic_id: topicId && UUID.test(topicId) ? topicId : undefined,
    cursor: cursor || undefined,
  };
}

/** Whether anything is narrowing the list, so "nothing here" can say which kind of nothing. */
export function isFiltered(query: ContentQuery): boolean {
  return Boolean(
    query.status ?? query.q ?? query.role ?? query.level ?? query.type ?? query.topic_id,
  );
}

/**
 * The link to the next page: the filters as they are, with this page's cursor. Keyset paging only
 * goes forward; back is the browser's back button, which is where a reader looks for it anyway.
 */
export function nextPageHref(pathname: string, query: ContentQuery, cursor: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, cursor })) {
    if (value) params.set(key, value);
  }
  return `${pathname}?${params.toString()}`;
}

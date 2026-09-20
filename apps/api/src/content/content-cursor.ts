import { HttpStatus } from "@nestjs/common";
import { z } from "zod";
import { ApiError } from "../http/api-error";

/**
 * Keyset paging for the admin lists: the API's first pagination, and the pattern the rest should
 * follow. A cursor is the `(updated_at, id)` of the last row read, so a row edited while the
 * reader pages never shifts the page under them — which offsets cannot promise.
 */

const Cursor = z.object({ at: z.iso.datetime(), id: z.uuid() });
export type Cursor = z.infer<typeof Cursor>;

export const encodeCursor = (row: { updatedAt: Date; id: string }): string =>
  Buffer.from(JSON.stringify({ at: row.updatedAt.toISOString(), id: row.id })).toString(
    "base64url",
  );

/** Cursors come from a client and are therefore input: an unreadable one is a 400, not a 500. */
export function decodeCursor(cursor: string): Cursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(HttpStatus.BAD_REQUEST, "content_cursor_invalid", "unreadable cursor");
  }
  const result = Cursor.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(HttpStatus.BAD_REQUEST, "content_cursor_invalid", "unreadable cursor");
  }
  return result.data;
}

/**
 * The `where` that continues a list ordered by `updated_at desc, id desc`, or `undefined` for the
 * first page. Written as an OR because "older, or the same instant and a lower id" is what
 * "strictly after this row" means when timestamps can tie.
 */
export function cursorWhere(cursor: string | undefined) {
  if (!cursor) return undefined;
  const { at, id } = decodeCursor(cursor);
  const updatedAt = new Date(at);
  return { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: id } }] };
}

/**
 * Splits the `limit + 1` rows a list query asks for into the page and the cursor that follows it.
 * Asking for one more row is how we know there is a next page without counting the table.
 */
export function paginate<T extends { updatedAt: Date; id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; next_cursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, next_cursor: hasMore && last ? encodeCursor(last) : null };
}

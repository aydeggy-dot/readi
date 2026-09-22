import { describe, expect, it } from "vitest";
import { cursorWhere, decodeCursor, encodeCursor, paginate } from "./content-cursor";

const row = (id: string, at: string) => ({ id, updatedAt: new Date(at) });
const UUID = "3f3b0f6a-1d1e-4a52-9b0e-6f1a2c3d4e5f";

describe("keyset paging", () => {
  it("round-trips the row it points at", () => {
    const cursor = encodeCursor(row(UUID, "2026-09-20T10:00:00.000Z"));
    expect(decodeCursor(cursor)).toEqual({ at: "2026-09-20T10:00:00.000Z", id: UUID });
  });

  it("treats an unreadable cursor as bad input, not a crash", () => {
    for (const cursor of ["not-base64url!", Buffer.from('{"at":1}').toString("base64url")]) {
      expect(() => decodeCursor(cursor)).toThrowError(/unreadable cursor/);
    }
  });

  it("continues from the row, including rows that share its timestamp", () => {
    const where = cursorWhere(encodeCursor(row(UUID, "2026-09-20T10:00:00.000Z")));
    expect(where).toEqual({
      OR: [
        { updatedAt: { lt: new Date("2026-09-20T10:00:00.000Z") } },
        { updatedAt: new Date("2026-09-20T10:00:00.000Z"), id: { lt: UUID } },
      ],
    });
  });

  it("has no where clause for the first page", () => {
    expect(cursorWhere(undefined)).toBeUndefined();
  });

  it("returns a cursor only when the extra row proves there is more", () => {
    const first = row(UUID, "2026-09-20T10:00:00.000Z");
    const rows = [first, row(UUID, "2026-09-20T09:00:00.000Z")];
    expect(paginate(rows, 2).next_cursor).toBeNull();
    expect(paginate(rows, 2).items).toHaveLength(2);

    const page = paginate(rows, 1);
    expect(page.items).toHaveLength(1);
    expect(page.next_cursor).toBe(encodeCursor(first));
  });

  it("has no cursor for an empty page", () => {
    expect(paginate([], 10)).toEqual({ items: [], next_cursor: null });
  });
});

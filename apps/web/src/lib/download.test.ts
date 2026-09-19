import { describe, expect, it } from "vitest";
import { filenameFromDisposition } from "./download";

describe("filenameFromDisposition", () => {
  it("reads a quoted filename", () => {
    expect(filenameFromDisposition('attachment; filename="readi-data-2026-09-19.json"')).toBe(
      "readi-data-2026-09-19.json",
    );
  });

  it("ignores missing headers and names with path separators", () => {
    expect(filenameFromDisposition(null)).toBeUndefined();
    expect(filenameFromDisposition("attachment")).toBeUndefined();
    expect(filenameFromDisposition('attachment; filename="../x.json"')).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { dedupeStack, earliestLocalDate } from "./profiles.service";

describe("dedupeStack", () => {
  it("keeps the first spelling of each item, ignoring case", () => {
    expect(dedupeStack(["React", "react", "Node.js", "REACT", "node.js", "Go"])).toEqual([
      "React",
      "Node.js",
      "Go",
    ]);
  });
});

describe("earliestLocalDate", () => {
  it("is yesterday (UTC) until 12:00 UTC, then today", () => {
    expect(earliestLocalDate(new Date("2026-09-19T11:59:59Z"))).toBe("2026-09-18");
    expect(earliestLocalDate(new Date("2026-09-19T12:00:00Z"))).toBe("2026-09-19");
  });
});

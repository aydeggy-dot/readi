import { describe, expect, it } from "vitest";
import { sameContent, stableStringify } from "./content-diff";

describe("content change detection", () => {
  it("does not care what order the keys arrived in", () => {
    expect(sameContent({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true);
  });

  it("does care about the order of a list: a reordered rubric is a changed rubric", () => {
    expect(sameContent({ criteria: ["a", "b"] }, { criteria: ["b", "a"] })).toBe(false);
  });

  it("tells null from missing, and null from an empty string", () => {
    expect(sameContent({ summary: null }, {})).toBe(false);
    expect(sameContent({ summary: null }, { summary: "" })).toBe(false);
  });

  it("ignores undefined, which is how an absent optional arrives", () => {
    expect(sameContent({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it("writes a stable string for nested content", () => {
    expect(stableStringify({ b: [1, { z: null, a: "x" }], a: true })).toBe(
      '{"a":true,"b":[1,{"a":"x","z":null}]}',
    );
  });
});

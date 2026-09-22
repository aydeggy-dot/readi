import { describe, expect, it } from "vitest";
import { orderedForRole } from "./catalogue-order";

const row = (id: string) => ({ id });

describe("orderedForRole", () => {
  it("puts what the role already offers first, in the role's order", () => {
    const catalogue = [row("a"), row("b"), row("c")];
    expect(orderedForRole(catalogue, ["c", "a"]).map((item) => item.id)).toEqual(["c", "a", "b"]);
  });

  /*
   * The reason this function exists: a seeded role lists its stacks in a deliberate order, and
   * opening its editor and pressing Save must not rewrite that order into the catalogue's.
   */
  it("keeps an order the catalogue does not share", () => {
    const catalogue = [row("a"), row("b"), row("c"), row("d")];
    expect(orderedForRole(catalogue, ["d", "b"]).map((item) => item.id)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
  });

  it("appends everything the role does not offer yet, so a new tick joins the end", () => {
    expect(orderedForRole([row("a"), row("b")], []).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("ignores an id the catalogue did not return", () => {
    expect(orderedForRole([row("a")], ["gone", "a"]).map((item) => item.id)).toEqual(["a"]);
  });

  it("lists a row once even if the role names it twice", () => {
    expect(orderedForRole([row("a"), row("b")], ["a", "a"]).map((item) => item.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

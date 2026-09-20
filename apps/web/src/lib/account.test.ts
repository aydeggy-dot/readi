import { describe, expect, it } from "vitest";
import { confirmsDeletion } from "./account";

describe("confirmsDeletion", () => {
  it("accepts the word, with stray spaces from a mobile keyboard", () => {
    expect(confirmsDeletion("DELETE")).toBe(true);
    expect(confirmsDeletion("  DELETE ")).toBe(true);
  });

  it("rejects anything else, including the wrong case", () => {
    for (const typed of ["delete", "Delete", "DELET", "DELETE ACCOUNT", "yes", ""]) {
      expect(confirmsDeletion(typed), typed).toBe(false);
    }
  });
});

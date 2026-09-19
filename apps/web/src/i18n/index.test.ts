import { describe, expect, it } from "vitest";
import { t, type MessageKey } from "./index";

describe("t", () => {
  it("returns the message for a key", () => {
    expect(t("app.name")).toBe("Readi");
  });

  it("interpolates variables", () => {
    expect(t("status.checkedIn", { ms: 12 })).toBe("12 ms");
  });

  it("leaves unknown placeholders intact", () => {
    expect(t("status.checkedIn")).toBe("{ms} ms");
  });

  it("throws for a key that is not a message", () => {
    expect(() => t("status" as MessageKey)).toThrow(/Missing message/);
  });
});

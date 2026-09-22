import { describe, expect, it } from "vitest";
import { needsProductionAcknowledgement, PRODUCTION_REFUSAL } from "./production";

describe("the production acknowledgement", () => {
  it("is required in production and nowhere else", () => {
    expect(needsProductionAcknowledgement("production", false)).toBe(true);
    expect(needsProductionAcknowledgement("development", false)).toBe(false);
    expect(needsProductionAcknowledgement("test", false)).toBe(false);
  });

  it("is satisfied by the flag", () => {
    expect(needsProductionAcknowledgement("production", true)).toBe(false);
  });

  it("names the flag in the refusal, because a refusal with no way out is a bug", () => {
    expect(PRODUCTION_REFUSAL).toContain("--acknowledge-production");
  });
});

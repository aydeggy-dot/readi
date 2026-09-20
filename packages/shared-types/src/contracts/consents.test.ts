import { describe, expect, it } from "vitest";
import { CONSENT_TYPES, CONSENT_VERSIONS } from "../constants.js";
import { UpdateConsentsRequest } from "./consents.js";

describe("consent contracts", () => {
  it("has a current version for every consent type", () => {
    expect(Object.keys(CONSENT_VERSIONS).sort()).toEqual([...CONSENT_TYPES].sort());
  });

  it("accepts one decision per type", () => {
    const decisions = CONSENT_TYPES.map((type) => ({ type, granted: false, version: 1 }));
    expect(UpdateConsentsRequest.safeParse({ decisions }).success).toBe(true);
  });

  it("rejects unknown types, version 0 and empty requests", () => {
    for (const decisions of [
      [{ type: "location", granted: true, version: 1 }],
      [{ type: "marketing", granted: true, version: 0 }],
      [],
    ]) {
      expect(UpdateConsentsRequest.safeParse({ decisions }).success).toBe(false);
    }
  });
});

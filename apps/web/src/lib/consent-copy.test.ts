import { CONSENT_TYPES } from "@readi/shared-types/constants";
import { describe, expect, it } from "vitest";
import { consentCopy } from "./consent-copy";

describe("consentCopy", () => {
  it.each(CONSENT_TYPES)("has a title and body for the current version of %s", (type) => {
    const copy = consentCopy(type);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.body.length).toBeGreaterThan(0);
  });
});

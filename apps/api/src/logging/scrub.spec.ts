import { describe, expect, it } from "vitest";
import { REDACTED_EMAIL, REDACTED_PHONE, scrub, scrubValue } from "./scrub";

describe("scrub", () => {
  it.each([
    ["user amaka.o+test@example.com.ng signed in", `user ${REDACTED_EMAIL} signed in`],
    ["otp sent to +2348031234567", `otp sent to ${REDACTED_PHONE}`],
    ["termii to=2348031234567", `termii to=${REDACTED_PHONE}`],
    ["call 08031234567 now", `call ${REDACTED_PHONE} now`],
    ["uk +447911123456", `uk ${REDACTED_PHONE}`],
  ])("redacts %s", (input, expected) => {
    expect(scrub(input)).toBe(expected);
  });

  it("leaves ids and timestamps alone", () => {
    const line = "user 8d3f9c2e-4b1a-4c7e-9f00-123456789012 at 1758284400000 latency 12 ms";
    expect(scrub(line)).toBe(line);
  });

  it("scrubs error messages and stacks", () => {
    const error = scrubValue(new Error("duplicate email a@b.co")) as Error;
    expect(error.message).toBe(`duplicate email ${REDACTED_EMAIL}`);
    expect(error.stack).not.toContain("a@b.co");
  });

  it("scrubs structured values by serialising them", () => {
    expect(scrubValue({ to: "+2348031234567" })).toBe(`{"to":"${REDACTED_PHONE}"}`);
  });
});

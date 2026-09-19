import { describe, expect, it } from "vitest";
import { isAllowedPhoneNumber, isPlaceholderEmail, placeholderEmail } from "./phone";

describe("isAllowedPhoneNumber", () => {
  it.each(["+2348031234567", "+2349051234567", "+2347011234567"])(
    "accepts Nigerian mobile %s",
    (n) => {
      expect(isAllowedPhoneNumber(n)).toBe(true);
    },
  );

  it.each([
    ["UK mobile", "+447911123456"],
    ["local format", "08031234567"],
    ["spaces", "+234 803 123 4567"],
    ["too short", "+2348031"],
    ["Lagos landline", "+23412345678"],
  ])("rejects %s", (_label, n) => {
    expect(isAllowedPhoneNumber(n)).toBe(false);
  });
});

describe("placeholder emails", () => {
  it("are unique, reserved-TLD addresses that never contain the phone number", () => {
    const a = placeholderEmail();
    expect(a).not.toBe(placeholderEmail());
    expect(a).toMatch(/^user-[0-9a-f-]{36}@phone\.readi\.invalid$/);
    expect(isPlaceholderEmail(a)).toBe(true);
    expect(isPlaceholderEmail("amaka@example.com")).toBe(false);
  });
});

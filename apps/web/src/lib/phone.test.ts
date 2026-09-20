import { describe, expect, it } from "vitest";
import { toNigerianE164 } from "./phone";

describe("toNigerianE164", () => {
  it.each([
    "08031234567",
    "0803 123 4567",
    "803-123-4567",
    "8031234567",
    "2348031234567",
    "+2348031234567",
    "+234 803 123 4567",
    "+234 (0) 803 123 4567",
  ])("normalises %s", (input) => {
    expect(toNigerianE164(input)).toBe("+2348031234567");
  });

  it.each(["", "0803123456", "080312345678", "+4478031234567", "0003123456x", "0 000 000 0000"])(
    "rejects %s",
    (input) => {
      expect(toNigerianE164(input)).toBeNull();
    },
  );
});

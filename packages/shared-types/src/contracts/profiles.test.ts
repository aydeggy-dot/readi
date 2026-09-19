import { describe, expect, it } from "vitest";
import { UpdateProfileRequest } from "./profiles.js";

const valid = {
  name: "Ada",
  target_role: "frontend",
  level: "intern_junior",
  years_experience: 1,
  stack: ["React", "TypeScript"],
  target_company_type: "remote_foreign",
  target_date: "2026-12-01",
};

describe("profile contracts", () => {
  it("accepts a complete profile and trims text", () => {
    const parsed = UpdateProfileRequest.parse({ ...valid, name: "  Ada ", stack: [" React "] });
    expect(parsed.name).toBe("Ada");
    expect(parsed.stack).toEqual(["React"]);
  });

  it("allows no target date", () => {
    expect(UpdateProfileRequest.safeParse({ ...valid, target_date: null }).success).toBe(true);
  });

  it.each([
    ["an unknown role", { target_role: "devops" }],
    ["a blank name", { name: "   " }],
    ["negative experience", { years_experience: -1 }],
    ["fractional experience", { years_experience: 1.5 }],
    ["an empty stack", { stack: [] }],
    ["a blank stack item", { stack: ["React", " "] }],
    ["a timestamp instead of a date", { target_date: "2026-12-01T00:00:00Z" }],
  ])("rejects %s", (_label, patch) => {
    expect(UpdateProfileRequest.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { canViewStatus } from "./access";

describe("canViewStatus", () => {
  it("is public outside production", () => {
    expect(canViewStatus("development", undefined)).toBe(true);
    expect(canViewStatus("test", "candidate")).toBe(true);
  });

  it("is admin-only in production", () => {
    expect(canViewStatus("production", undefined)).toBe(false);
    expect(canViewStatus("production", "candidate")).toBe(false);
    expect(canViewStatus("production", "content_expert")).toBe(false);
    expect(canViewStatus("production", "admin")).toBe(true);
  });
});

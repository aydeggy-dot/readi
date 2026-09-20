import { describe, expect, it } from "vitest";
import { MeResponse, Role } from "./users.js";

const me = {
  id: "8d3f9c2e-4b1a-4c7e-9f00-1a2b3c4d5e6f",
  role: "candidate",
  email: null,
  email_verified: false,
  phone_number: "+2348031234567",
  phone_number_verified: true,
  signup_method: "phone",
  name: "",
  onboarding: { profile_completed: false, consents_completed: false, completed_at: null },
};

describe("users contracts", () => {
  it("accepts a phone user without an email", () => {
    expect(MeResponse.parse(me)).toEqual(me);
  });

  it("does not accept the reserved org_admin role yet", () => {
    expect(Role.safeParse("org_admin").success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(MeResponse.safeParse({ ...me, email: "not-an-email" }).success).toBe(false);
  });
});

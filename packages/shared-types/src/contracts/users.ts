import { z } from "zod";

/** RBAC roles (spec §4.8). `org_admin` is reserved for P2 and not accepted yet. */
export const Role = z.enum(["candidate", "content_expert", "admin"]);
export type Role = z.infer<typeof Role>;

/** How the account was created (spec §6.1 `User.signup_method`). */
export const SignupMethod = z.enum(["email", "google", "phone"]);
export type SignupMethod = z.infer<typeof SignupMethod>;

/** Response body of `GET /api/me`: the signed-in user as the web app may see it. */
export const MeResponse = z.object({
  id: z.uuid(),
  role: Role,
  /** Null for phone sign-ups that have not added an email address yet. */
  email: z.email().nullable(),
  email_verified: z.boolean(),
  /** E.164, e.g. +2348031234567. */
  phone_number: z.string().nullable(),
  phone_number_verified: z.boolean(),
  signup_method: SignupMethod,
});
export type MeResponse = z.infer<typeof MeResponse>;

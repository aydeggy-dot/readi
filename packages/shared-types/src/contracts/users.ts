import { z } from "zod";
import { ROLES, SIGNUP_METHODS } from "../constants.js";

/** RBAC roles (spec §4.8). `org_admin` is reserved for P2 and not accepted yet. */
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

/** How the account was created (spec §6.1 `User.signup_method`). */
export const SignupMethod = z.enum(SIGNUP_METHODS);
export type SignupMethod = z.infer<typeof SignupMethod>;

/** Where the user is in onboarding (spec §5 flow 1). */
export const OnboardingState = z
  .object({
    profile_completed: z.boolean(),
    /** A decision (granted or not) has been recorded for every consent type. */
    consents_completed: z.boolean(),
    completed_at: z.iso.datetime().nullable(),
  })
  .meta({ id: "OnboardingState" });
export type OnboardingState = z.infer<typeof OnboardingState>;

/** Response body of `GET /api/me`: the signed-in user as the web app may see it. */
export const MeResponse = z.object({
  id: z.uuid(),
  /** Display name; empty until the user sets it in onboarding. */
  name: z.string(),
  role: Role,
  /** Null for phone sign-ups that have not added an email address yet. */
  email: z.email().nullable(),
  email_verified: z.boolean(),
  /** E.164, e.g. +2348031234567. */
  phone_number: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable(),
  phone_number_verified: z.boolean(),
  signup_method: SignupMethod,
  onboarding: OnboardingState,
});
export type MeResponse = z.infer<typeof MeResponse>;

/** Response body of `GET /api/auth-methods`: which optional sign-in methods are configured. */
export const AuthMethodsResponse = z.object({
  google: z.boolean(),
});
export type AuthMethodsResponse = z.infer<typeof AuthMethodsResponse>;

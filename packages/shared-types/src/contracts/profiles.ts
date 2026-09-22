import { z } from "zod";
import { PROFILE_LIMITS, TARGET_COMPANY_TYPES } from "../constants.js";
import { Slug } from "./slug.js";

export const TargetCompanyType = z.enum(TARGET_COMPANY_TYPES).meta({ id: "TargetCompanyType" });
export type TargetCompanyType = z.infer<typeof TargetCompanyType>;

/** Body of `PUT /api/me/profile`: the career profile (spec §4.1) plus the display name. */
export const UpdateProfileRequest = z.object({
  name: z.string().trim().min(1).max(PROFILE_LIMITS.nameMaxLength),
  /**
   * The catalogue role and level this candidate is preparing for, by slug (ADR-0015). An unknown
   * or unpublished slug is a service-level `role_not_found` / `level_not_found`, not a schema
   * rejection: which roles exist is a fact about the database, and it changes without a deploy.
   */
  target_role: Slug,
  level: Slug,
  years_experience: z.int().min(0).max(PROFILE_LIMITS.yearsExperienceMax),
  /** Primary stack, e.g. ["React", "TypeScript"]. Duplicates (ignoring case) are removed. */
  stack: z
    .array(z.string().trim().min(1).max(PROFILE_LIMITS.stackItemMaxLength))
    .min(1)
    .max(PROFILE_LIMITS.stackMaxItems),
  target_company_type: TargetCompanyType,
  /** Optional target interview date (a calendar date, YYYY-MM-DD); not in the past. */
  target_date: z.iso.date().nullable(),
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequest>;

/** Response body of `GET`/`PUT /api/me/profile`. */
export const ProfileResponse = UpdateProfileRequest.extend({
  updated_at: z.iso.datetime(),
});
export type ProfileResponse = z.infer<typeof ProfileResponse>;

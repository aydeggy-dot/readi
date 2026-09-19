import { z } from "zod";
import {
  EXPERIENCE_LEVELS,
  PROFILE_LIMITS,
  TARGET_COMPANY_TYPES,
  TARGET_ROLES,
} from "../constants.js";

export const TargetRole = z.enum(TARGET_ROLES).meta({ id: "TargetRole" });
export type TargetRole = z.infer<typeof TargetRole>;

export const ExperienceLevel = z.enum(EXPERIENCE_LEVELS).meta({ id: "ExperienceLevel" });
export type ExperienceLevel = z.infer<typeof ExperienceLevel>;

export const TargetCompanyType = z.enum(TARGET_COMPANY_TYPES).meta({ id: "TargetCompanyType" });
export type TargetCompanyType = z.infer<typeof TargetCompanyType>;

/** Body of `PUT /api/me/profile`: the career profile (spec §4.1) plus the display name. */
export const UpdateProfileRequest = z.object({
  name: z.string().trim().min(1).max(PROFILE_LIMITS.nameMaxLength),
  target_role: TargetRole,
  level: ExperienceLevel,
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

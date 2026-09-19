import { z } from "zod";
import { CONSENT_TYPES } from "../constants.js";

export const ConsentType = z.enum(CONSENT_TYPES).meta({ id: "ConsentType" });
export type ConsentType = z.infer<typeof ConsentType>;

/** One consent choice, made against the version of the text the user was shown. */
export const ConsentDecision = z
  .object({
    type: ConsentType,
    granted: z.boolean(),
    version: z.int().min(1),
  })
  .meta({ id: "ConsentDecision" });
export type ConsentDecision = z.infer<typeof ConsentDecision>;

/** Body of `PUT /api/me/consents`. Each type at most once; unchanged decisions are not re-recorded. */
export const UpdateConsentsRequest = z.object({
  decisions: z.array(ConsentDecision).min(1).max(CONSENT_TYPES.length),
});
export type UpdateConsentsRequest = z.infer<typeof UpdateConsentsRequest>;

/** The latest decision for one consent type. */
export const ConsentStatus = z
  .object({
    type: ConsentType,
    /** True only if the latest decision granted the CURRENT version of the text. */
    granted: z.boolean(),
    /** Version the latest decision was made against; null if the user has never decided. */
    version: z.int().min(1).nullable(),
    current_version: z.int().min(1),
    decided_at: z.iso.datetime().nullable(),
  })
  .meta({ id: "ConsentStatus" });
export type ConsentStatus = z.infer<typeof ConsentStatus>;

/** Response body of `GET`/`PUT /api/me/consents`: one entry per consent type. */
export const ConsentsResponse = z.object({
  consents: z.array(ConsentStatus),
});
export type ConsentsResponse = z.infer<typeof ConsentsResponse>;

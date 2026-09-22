import { z } from "zod";
import { CONTENT_LIMITS, SLUG_PATTERN } from "../constants.js";

/**
 * A slug: the stable, human-readable key the wire carries for a row in the database (ADR-0015).
 *
 * Roles, levels, stacks, topics and rubrics are content, not enums, so a request cannot name one
 * with a closed-set value. It names it with its slug — `?role=backend`, `levels: [intern-junior]`
 * — and the service resolves that to a row, raising a mapped `*_not_found` error when there is
 * none. Validation here is **syntax only**: whether `backend` exists is a question for the
 * database, not for a schema, and answering it in Zod would mean a contract that changes meaning
 * when someone publishes a role.
 *
 * This lives in its own module rather than in `catalogue.ts` because `content.ts`, `seed.ts`,
 * `profiles.ts` and `cv.ts` all need it, and `catalogue.ts` already imports from `content.ts`.
 *
 * Deliberately **not** a registered contract (no `.meta({ id })`): it is a string with a pattern,
 * and giving it a component name would put `$ref: "#/components/schemas/Slug"` in place of every
 * role and level field in the OpenAPI document, which tells a client nothing it did not know.
 */
export const Slug = z
  .string()
  .min(1)
  .max(CONTENT_LIMITS.slugMaxLength)
  .regex(new RegExp(SLUG_PATTERN), "lowercase words joined by single hyphens");
export type Slug = z.infer<typeof Slug>;

/** Nothing may be listed twice: a duplicate slug is a typo, and the join tables key on the pair. */
export const distinctSlugs = (slugs: readonly string[]): boolean =>
  new Set(slugs).size === slugs.length;

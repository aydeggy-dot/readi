import { z } from "zod";
import { CATALOGUE_LIMITS, CONTENT_LIMITS, QUESTION_TYPES, SLUG_PATTERN } from "../constants.js";
import { ContentStatus, QuestionType } from "./content.js";

/**
 * The catalogue: **career roles, career levels and stacks as content** (ADR-0015).
 *
 * Until M2.5 these were three closed sets — a Zod enum, two Postgres enums, a generated Pydantic
 * `Literal` and an i18n namespace whose keys *were* the enum values — so adding a role meant a code
 * change in five artefacts and a migration. They are now ordinary publishable content, with the
 * same workflow, version history, audit trail and review state as a question or a rubric.
 *
 * Three rules shape this file:
 *
 * 1. **Slugs on the wire, uuids in the database.** `?role=backend` keeps working, seed files keep
 *    referring to each other by slug, and the admin shapes still carry ids because the CMS edits
 *    rows.
 * 2. **Labels come from the API.** A database-managed role has no message key, so `name` travels
 *    with the row. English only at launch; the trade-off is recorded in ADR-0015.
 * 3. **Candidate shapes are separate, smaller shapes**, as everywhere else in the content
 *    contracts (ADR-0014) — never an admin shape with fields omitted.
 */

const slug = () =>
  z
    .string()
    .min(1)
    .max(CONTENT_LIMITS.slugMaxLength)
    .regex(new RegExp(SLUG_PATTERN), "lowercase words joined by single hyphens");

const title = () => z.string().trim().min(1).max(CONTENT_LIMITS.titleMaxLength);
const summary = () => z.string().trim().min(1).max(CONTENT_LIMITS.summaryMaxLength).nullable();

/** Nothing may be listed twice: the join tables key on the pair, and a duplicate is a typo. */
const distinct = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

// -----------------------------------------------------------------------------------------------
// Career levels. The ladder a role is hired at; `rank` orders them against each other.

export const CareerLevelInput = z.object({
  slug: slug(),
  name: title(),
  summary: summary(),
  /**
   * Where this level sits on the ladder, lowest first. Sparse by convention (10, 20, 30…) so a
   * level can be inserted between two others without renumbering the catalogue.
   */
  rank: z.int().min(0).max(CATALOGUE_LIMITS.levelRankMax),
});
export type CareerLevelInput = z.infer<typeof CareerLevelInput>;

/**
 * Whether `/content/seed` still owns this row's content (ADR-0014 decision 5), whether a model
 * drafted it and nobody has vouched for it yet (decision 6), and when a review was recorded. Admin
 * shapes only — the three facts are about who wrote the catalogue, not about what it says.
 */
const authorship = {
  seed_managed: z.boolean(),
  ai_draft_unreviewed: z.boolean(),
  reviewed_at: z.iso.datetime().nullable(),
};

const workflow = {
  status: ContentStatus,
  version: z.int().min(1),
  updated_at: z.iso.datetime(),
};

export const CareerLevel = CareerLevelInput.extend({
  id: z.uuid(),
  ...workflow,
  ...authorship,
});
export type CareerLevel = z.infer<typeof CareerLevel>;

// -----------------------------------------------------------------------------------------------
// Stacks. The variant a candidate is interviewed for — "Java / Spring" rather than "backend" — so
// that a Node candidate and a Spring candidate are not asked the same questions (spec §4.2).

export const StackInput = z.object({
  slug: slug(),
  name: title(),
  summary: summary(),
});
export type StackInput = z.infer<typeof StackInput>;

export const Stack = StackInput.extend({
  id: z.uuid(),
  ...workflow,
  ...authorship,
});
export type Stack = z.infer<typeof Stack>;

// -----------------------------------------------------------------------------------------------
// Career roles, and what they offer.

/** One stack a role offers. `is_default` is what the onboarding picker starts on. */
export const CareerRoleStackInput = z
  .object({ stack_id: z.uuid(), is_default: z.boolean() })
  .meta({ id: "CareerRoleStackInput" });
export type CareerRoleStackInput = z.infer<typeof CareerRoleStackInput>;

export const CareerRoleInput = z
  .object({
    slug: slug(),
    name: title(),
    summary: summary(),
    /** Where the role sits in the list a candidate chooses from; ties break by name. */
    position: z.int().min(0).max(999),
    /**
     * Which kinds of question a session for this role may use. Not every role interviews the same
     * way — QA is asked to design tests, and M3 reads this to decide what a session may contain.
     */
    supported_question_types: z.array(QuestionType).min(1).max(QUESTION_TYPES.length),
    /** The levels this role is hired at, in the order a candidate should see them. */
    levels: z.array(z.uuid()).max(CATALOGUE_LIMITS.roleLevels),
    /** The stack variants this role offers, in display order. */
    stacks: z.array(CareerRoleStackInput).max(CATALOGUE_LIMITS.roleStacks),
  })
  .refine((role) => distinct(role.supported_question_types), {
    message: "a question type may be listed only once",
    path: ["supported_question_types"],
  })
  .refine((role) => distinct(role.levels), {
    message: "a level may be listed only once",
    path: ["levels"],
  })
  .refine((role) => distinct(role.stacks.map((link) => link.stack_id)), {
    message: "a stack may be listed only once",
    path: ["stacks"],
  })
  /*
   * `is_default` is where the onboarding picker starts, and a picker starts in one place. None is
   * legitimate — the candidate then has to choose — but two is a content mistake that would make
   * the default arbitrary, decided by whichever row the query returned first.
   */
  .refine((role) => role.stacks.filter((link) => link.is_default).length <= 1, {
    message: "only one stack can be the default",
    path: ["stacks"],
  });
export type CareerRoleInput = z.infer<typeof CareerRoleInput>;

/**
 * A role as the CMS edits it. `levels` and `stacks` are ids, like a track's topics: the CMS holds
 * the catalogue it is editing against, and resolving names here would mean a second shape to keep
 * in step. The candidate shapes below carry resolved rows, which is where names are needed.
 */
export const CareerRole = z.object({
  id: z.uuid(),
  slug: slug(),
  name: title(),
  summary: summary(),
  position: z.int().min(0).max(999),
  supported_question_types: z.array(QuestionType),
  levels: z.array(z.uuid()),
  stacks: z.array(CareerRoleStackInput),
  ...workflow,
  ...authorship,
});
export type CareerRole = z.infer<typeof CareerRole>;

// -----------------------------------------------------------------------------------------------
// Admin listing. The same keyset-cursor shape as the rest of the CMS (ADR-0014).

const nextCursor = () => z.string().min(1).max(CONTENT_LIMITS.cursorMaxLength).nullable();

export const CareerRoleListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    name: title(),
    position: z.int().min(0).max(999),
    level_count: z.int().min(0),
    stack_count: z.int().min(0),
    ...workflow,
    ...authorship,
  })
  .meta({ id: "CareerRoleListItem" });
export type CareerRoleListItem = z.infer<typeof CareerRoleListItem>;

export const CareerRoleListResponse = z.object({
  items: z.array(CareerRoleListItem),
  next_cursor: nextCursor(),
});
export type CareerRoleListResponse = z.infer<typeof CareerRoleListResponse>;

export const CareerLevelListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    name: title(),
    rank: z.int().min(0).max(CATALOGUE_LIMITS.levelRankMax),
    role_count: z.int().min(0),
    ...workflow,
    ...authorship,
  })
  .meta({ id: "CareerLevelListItem" });
export type CareerLevelListItem = z.infer<typeof CareerLevelListItem>;

export const CareerLevelListResponse = z.object({
  items: z.array(CareerLevelListItem),
  next_cursor: nextCursor(),
});
export type CareerLevelListResponse = z.infer<typeof CareerLevelListResponse>;

export const StackListItem = z
  .object({
    id: z.uuid(),
    slug: slug(),
    name: title(),
    role_count: z.int().min(0),
    ...workflow,
    ...authorship,
  })
  .meta({ id: "StackListItem" });
export type StackListItem = z.infer<typeof StackListItem>;

export const StackListResponse = z.object({
  items: z.array(StackListItem),
  next_cursor: nextCursor(),
});
export type StackListResponse = z.infer<typeof StackListResponse>;

// -----------------------------------------------------------------------------------------------
// Candidate shapes. Published rows only, resolved into what a picker needs to draw itself.

/**
 * NOTE on the field name. A candidate payload must not carry a key containing `levels`: the leak
 * detector behind `content-no-answer-key.int.spec.ts` reserves that word for a rubric's level
 * descriptors, which are answer key. `level_options` is the levels a role offers — a different
 * fact with, deliberately, a different name.
 */
export const CandidateCareerLevel = z
  .object({ slug: slug(), name: title(), summary: summary() })
  .meta({ id: "CandidateCareerLevel" });
export type CandidateCareerLevel = z.infer<typeof CandidateCareerLevel>;

export const CandidateStack = z
  .object({ slug: slug(), name: title(), summary: summary(), is_default: z.boolean() })
  .meta({ id: "CandidateStack" });
export type CandidateStack = z.infer<typeof CandidateStack>;

export const CandidateCareerRole = z
  .object({
    slug: slug(),
    name: title(),
    summary: summary(),
    supported_question_types: z.array(QuestionType),
    level_options: z.array(CandidateCareerLevel),
    stacks: z.array(CandidateStack),
  })
  .meta({ id: "CandidateCareerRole" });
export type CandidateCareerRole = z.infer<typeof CandidateCareerRole>;

/**
 * `GET /api/content/career-roles` — the catalogue onboarding and the session setup screen read.
 * Published roles only, each carrying its published levels and stacks: a level retired after a
 * role was published simply stops being offered, rather than being offered and then refused.
 */
export const CareerRolesResponse = z.object({ roles: z.array(CandidateCareerRole) });
export type CareerRolesResponse = z.infer<typeof CareerRolesResponse>;

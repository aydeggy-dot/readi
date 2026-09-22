import type { StackListItem } from "@readi/shared-types";
import { CONTENT_LIMITS } from "@readi/shared-types/constants";
import { serverApi } from "@/lib/session";

/**
 * The levels and stacks a role's editor offers (ADR-0015).
 *
 * Drafts and retired rows are included deliberately: a role is often assembled before its levels
 * go out, and a retired level a role still lists has to stay visible, or saving the form would
 * quietly drop it. Candidates see neither — the candidate read filters to published (the API does
 * that, not this).
 *
 * Both lists are capped at one page. That is far above the per-role limits (8 levels, 20 stacks),
 * but a catalogue that outgrows it would start hiding choices, so `capped` is returned and the
 * editor says so rather than letting a save remove what it never showed.
 */
export async function catalogueChoices() {
  const api = await serverApi();
  const query = { limit: CONTENT_LIMITS.pageSize.max };
  const [levels, stacks] = await Promise.all([
    api.GET("/api/admin/content/career-levels", { params: { query } }),
    stackChoices(),
  ]);
  if (!levels.data) throw new Error("GET the catalogue for the role editor failed");

  /*
   * The lists arrive in the CMS's order — most recently edited first — which is right for a list
   * someone is working through and wrong for a picker: an editor looking for "Cypress" among
   * twenty stacks should not have to know when it was last touched. Levels go by rank, because
   * that is the ladder; stacks by name, because that is how they are looked for.
   */
  return {
    levels: [...levels.data.items].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    stacks: stacks.stacks,
    /** The page size, when there is more than one page of either; null when everything fits. */
    capped: levels.data.next_cursor || stacks.capped ? CONTENT_LIMITS.pageSize.max : null,
  };
}

/**
 * The stacks a question can be tagged for, by name (ADR-0015) — the role editor's stack half, and
 * the question editor's whole need, so it is written once.
 *
 * `capped` matters here for the same reason it does there: a catalogue with more than one page of
 * stacks would start hiding choices, and a save would drop what the form never showed.
 */
export async function stackChoices(): Promise<{ stacks: StackListItem[]; capped: boolean }> {
  const api = await serverApi();
  const stacks = await api.GET("/api/admin/content/stacks", {
    params: { query: { limit: CONTENT_LIMITS.pageSize.max } },
  });
  if (!stacks.data) throw new Error("GET the stacks for the CMS failed");
  return {
    stacks: [...stacks.data.items].sort((a, b) => a.name.localeCompare(b.name)),
    capped: stacks.data.next_cursor !== null,
  };
}

/** A catalogue row as a picker needs it: the slug that is stored, and the name that is shown. */
export interface CatalogueOption {
  slug: string;
  name: string;
}

/**
 * The roles and levels that *other* content is tagged with — a track's role and level, a
 * question's lists of both — for the CMS's editors and filter bars (ADR-0015).
 *
 * Slugs rather than ids here, because that is what a track and a question store. Drafts and
 * retired rows are included for the same reason as above: a question is written for a role before
 * the role goes out, and a row already tagged has to stay pickable or saving would drop it.
 *
 * One page each, uncapped deliberately: a role is a whole hiring track and a level a rung on a
 * ladder, so a catalogue that outgrew 100 of either would be a product problem long before it was
 * a paging one — unlike stacks, where the editor has to say when it is showing only the first page.
 */
export async function roleAndLevelChoices(): Promise<{
  roles: CatalogueOption[];
  levels: CatalogueOption[];
}> {
  const api = await serverApi();
  const query = { limit: CONTENT_LIMITS.pageSize.max };
  const [roles, levels] = await Promise.all([
    api.GET("/api/admin/content/career-roles", { params: { query } }),
    api.GET("/api/admin/content/career-levels", { params: { query } }),
  ]);
  if (!roles.data || !levels.data) throw new Error("GET the catalogue for the CMS failed");

  // The order a candidate meets them in: roles by position, levels by the ladder they describe.
  return {
    roles: [...roles.data.items].sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    ),
    levels: [...levels.data.items].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
  };
}

/**
 * Looks catalogue names up by slug, for a list that shows what a row is tagged with.
 *
 * A slug the catalogue no longer lists falls back to itself rather than to nothing: a question
 * tagged with a role that has since been deleted still has to draw a row, and the slug is the
 * truest thing left to say about it.
 */
export function slugNames(rows: readonly CatalogueOption[]): (slug: string) => string {
  const names = new Map(rows.map((row) => [row.slug, row.name]));
  return (slug) => names.get(slug) ?? slug;
}

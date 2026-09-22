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
    api.GET("/api/admin/content/stacks", { params: { query } }),
  ]);
  if (!levels.data || !stacks.data) throw new Error("GET the catalogue for the role editor failed");

  /*
   * The lists arrive in the CMS's order — most recently edited first — which is right for a list
   * someone is working through and wrong for a picker: an editor looking for "Cypress" among
   * twenty stacks should not have to know when it was last touched. Levels go by rank, because
   * that is the ladder; stacks by name, because that is how they are looked for.
   */
  return {
    levels: [...levels.data.items].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    stacks: [...stacks.data.items].sort((a, b) => a.name.localeCompare(b.name)),
    /** The page size, when there is more than one page of either; null when everything fits. */
    capped: levels.data.next_cursor || stacks.data.next_cursor ? CONTENT_LIMITS.pageSize.max : null,
  };
}

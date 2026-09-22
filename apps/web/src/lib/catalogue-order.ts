/**
 * Ordering the catalogue rows a role's editor offers (ADR-0015).
 *
 * A role's levels and stacks are stored in the order a candidate sees them, so the editor has to
 * draw them in that order too — otherwise ticking a box would silently reorder the picker, and
 * opening a seeded role and pressing Save would rewrite what candidates see without anyone
 * deciding to.
 *
 * So: what the role already offers, in its own order, then everything else in the catalogue's
 * order. A newly ticked row joins the end, which is the one rule a form cannot get wrong.
 */
export function orderedForRole<T extends { id: string }>(
  catalogue: readonly T[],
  chosen: readonly string[],
): T[] {
  const byId = new Map(catalogue.map((row) => [row.id, row]));
  const taken = new Set<string>();
  const ordered: T[] = [];
  for (const id of chosen) {
    const row = byId.get(id);
    // A row the list did not return (retired, or past the first page) is simply not offered here.
    if (row && !taken.has(id)) {
      ordered.push(row);
      taken.add(id);
    }
  }
  for (const row of catalogue) {
    if (!taken.has(row.id)) ordered.push(row);
  }
  return ordered;
}

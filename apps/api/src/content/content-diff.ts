/**
 * Change detection for content edits (ADR-0014 decision 2). A version snapshot is written only
 * when the content actually changed, so re-saving a form — or running the seed importer twice —
 * leaves no trail of identical versions.
 */

/** JSON with object keys in sorted order, so two equal values always produce the same string. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(",")}}`;
}

/** True when two content projections say the same thing, whatever order their keys arrived in. */
export const sameContent = (a: unknown, b: unknown): boolean =>
  stableStringify(a) === stableStringify(b);

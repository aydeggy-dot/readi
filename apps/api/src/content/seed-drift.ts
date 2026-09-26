import type { SeedReport } from "./seed-import";

/**
 * Does the database say what the files say?
 *
 * Every one of these is a difference, and the paid run is why none of them is excused. `created` and
 * `updated` are content the database has not got; `published` and `skipped` are content it has got
 * and will not take; `reviewed` is a file claiming a human has vouched for words the database still
 * marks as an unreviewed draft. A session pins whatever is in the database, so any of them means an
 * interview runs against something other than what is in the repository.
 */
export function hasDrift(report: SeedReport): boolean {
  return Object.values(report).some(
    (counts) =>
      counts.created + counts.updated + counts.reviewed > 0 ||
      counts.skipped.length + counts.published.length > 0,
  );
}

/** What `--check` says at the end: the verdict, and the one command that resolves it. */
export function formatDrift(report: SeedReport): string[] {
  if (!hasDrift(report)) return ["", "the database matches content/seed"];
  const needsForce = Object.values(report).some((counts) => counts.skipped.length > 0);
  return [
    "",
    "the database does not match content/seed — anything that pins content now pins the",
    "left-hand column, not what is in the repository.",
    "",
    needsForce
      ? "  pnpm db:seed -- --force              (some rows are CMS-owned; this takes them back)"
      : "  pnpm db:seed -- --force-published    (published rows the files still own)",
  ];
}

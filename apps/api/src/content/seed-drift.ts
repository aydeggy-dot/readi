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
      counts.skipped.length + counts.published.length + counts.orphans.length > 0,
  );
}

/** Published rows no seed file defines any more, as `kind: slug, slug` lines. */
function orphanLines(report: SeedReport): string[] {
  return Object.entries(report)
    .filter(([, counts]) => counts.orphans.length > 0)
    .map(([kind, counts]) => `  ${kind}: ${counts.orphans.join(", ")}`);
}

/**
 * What `--check` says at the end: the verdict, and the command that resolves it.
 *
 * Orphans get their own paragraph and deliberately **no** re-import command. A re-import cannot fix a
 * published row that no file describes any more — there is nothing to import over it — so the remedy
 * is to retire it in the CMS, and printing `--force-published` beside it would send the reader in a
 * circle.
 */
export function formatDrift(report: SeedReport): string[] {
  const orphans = orphanLines(report);
  const lines: string[] = [];
  if (orphans.length > 0)
    lines.push(
      "",
      "published, and no seed file defines them any more — the files created these and have since",
      "dropped them, and candidates are still being offered them:",
      ...orphans,
      "",
      "Retire them in /admin/content as an admin. A re-import cannot reach them: there is no file.",
    );

  const reimportable = Object.values(report).some(
    (counts) =>
      counts.created + counts.updated + counts.reviewed > 0 ||
      counts.skipped.length + counts.published.length > 0,
  );
  if (reimportable) {
    const needsForce = Object.values(report).some((counts) => counts.skipped.length > 0);
    lines.push(
      "",
      "the database does not match content/seed — anything that pins content now pins the",
      "left-hand column, not what is in the repository.",
      "",
      needsForce
        ? "  pnpm db:seed -- --force              (some rows are CMS-owned; this takes them back)"
        : "  pnpm db:seed -- --force-published    (published rows the files still own)",
    );
  }
  return lines.length > 0 ? lines : ["", "the database matches content/seed"];
}

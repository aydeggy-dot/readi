import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The guard for the mistake this project makes most often.
 *
 * Prisma cannot see an index it does not model — an index over an `Unsupported` column, or a
 * partial unique index — so **every** `prisma migrate dev` proposes dropping it, in migrations that
 * have nothing to do with the table. `DROP INDEX "questions_embedding_hnsw"` has now been generated
 * and deleted by hand **six** times, most recently in a migration whose only other line adds one
 * enum value (`20260925163003_ai_call_purpose_coverage`). And a dropped *column* takes its indexes
 * with it silently, with no `DROP INDEX` line to notice (M2.5 phase 3, `tasks/lessons.md`).
 *
 * `content-schema.int.spec.ts` asserts both objects exist in a migrated database, which is the
 * backstop. This is the earlier, cheaper one: it reads the committed SQL, needs no database, and
 * names the file and the line so the answer is "delete that line" rather than "why is duplicate
 * search slow now". Between them, losing one of these objects cannot reach `main` quietly.
 *
 * Adding a hand-written index, constraint or trigger means adding it here.
 */

/** A database object Prisma does not model, so Prisma will eventually propose destroying it. */
interface HandWritten {
  /** The object's name in the database, exactly as the migration that created it spells it. */
  name: string;
  /** Where it was created, for the failure message. */
  createdIn: string;
  /** The table it is built on. Dropping the table takes it too. */
  table: string;
  /** The columns it is built over. Dropping any of them takes it too, with no `DROP INDEX` line. */
  columns: string[];
  /** Why losing it matters, in the failure message — every one of these fails silently. */
  cost: string;
}

export const HAND_WRITTEN_SQL: HandWritten[] = [
  {
    name: "questions_embedding_hnsw",
    createdIn: "20260920215545_content_model",
    table: "questions",
    columns: ["embedding"],
    cost: "near-duplicate question search falls back to a sequential scan (ADR-0006)",
  },
  {
    name: "tracks_one_published_per_role_level",
    createdIn: "20260922145408_catalogue_switch",
    table: "tracks",
    columns: ["role_id", "level_id", "status"],
    cost: "two published tracks can claim one audience, months later, in data (ADR-0014)",
  },
];

const MIGRATIONS = resolve(__dirname, "../../prisma/migrations");

interface Migration {
  name: string;
  sql: string;
}

function migrations(): Migration[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8") }));
}

/** Strips `--` comments, so the note explaining a deleted `DROP INDEX` is not read as one. */
function statements(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** Whether `sql` recreates `name`, so a migration may legitimately drop and rebuild it. */
function recreates(sql: string, name: string): boolean {
  return new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX[^;]*?"?${name}"?`, "is").test(sql);
}

function mentions(sql: string, pattern: RegExp): boolean {
  return pattern.test(sql);
}

describe("hand-written migration SQL survives every migration", () => {
  const all = migrations();

  it("finds the migrations to check", () => {
    expect(all.length).toBeGreaterThan(0);
    // The migration that created each object is still there — otherwise this file is checking
    // that nothing drops an object nothing creates, and would pass for the wrong reason.
    for (const object of HAND_WRITTEN_SQL) {
      const created = all.find((migration) => migration.name === object.createdIn);
      expect(created, `${object.createdIn} is missing`).toBeDefined();
      expect(statements(created?.sql ?? "")).toContain(object.name);
    }
  });

  for (const object of HAND_WRITTEN_SQL) {
    describe(object.name, () => {
      it("is never dropped without being recreated", () => {
        for (const migration of all) {
          const sql = statements(migration.sql);
          const dropped = mentions(sql, new RegExp(`DROP\\s+INDEX[^;]*?"?${object.name}"?`, "is"));
          expect(
            dropped && !recreates(sql, object.name),
            `${migration.name} drops ${object.name} without recreating it.\n` +
              `Prisma proposes this in migrations that never touch "${object.table}" because it ` +
              `cannot see the index; delete the DROP INDEX line before applying (CLAUDE.md §5).\n` +
              `If it ships, nothing fails — ${object.cost}.`,
          ).toBe(false);
        }
      });

      it("keeps the columns it is built over", () => {
        for (const migration of all) {
          const sql = statements(migration.sql);
          if (!mentions(sql, new RegExp(`ALTER TABLE\\s+"?${object.table}"?`, "i"))) continue;
          for (const column of object.columns) {
            const dropped = mentions(sql, new RegExp(`DROP\\s+COLUMN\\s+"?${column}"?`, "i"));
            expect(
              dropped && !recreates(sql, object.name),
              `${migration.name} drops "${object.table}"."${column}", which ${object.name} is ` +
                `built over — Postgres drops the index with the column and Prisma proposes no ` +
                `DROP INDEX line at all (M2.5 phase 3, tasks/lessons.md).\n` +
                `Recreate the index in the same migration, or ${object.cost}.`,
            ).toBe(false);
          }
        }
      });

      it("keeps the table it is built on", () => {
        for (const migration of all) {
          const sql = statements(migration.sql);
          const dropped = mentions(
            sql,
            new RegExp(`DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?"?${object.table}"?`, "i"),
          );
          expect(
            dropped && !recreates(sql, object.name),
            `${migration.name} drops "${object.table}" without recreating ${object.name}.`,
          ).toBe(false);
        }
      });
    });
  }
});

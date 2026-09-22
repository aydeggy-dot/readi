-- M2.5 phase 3: tracks, questions and profiles move onto the catalogue, and the two closed-set
-- enums are dropped (ADR-0015).
--
-- This migration **converts data; it does not drop it**. Prisma's generated version would have
-- dropped `profiles.target_role`, `profiles.level`, `tracks.role`, `tracks.level`,
-- `questions.roles` and `questions.levels` and added the new columns as `NOT NULL` with no
-- backfill — which is why it refused to run at all against a database with rows in it. What
-- follows adds, backfills, verifies, and only then drops.
--
-- THREE THINGS WERE CHANGED FROM WHAT PRISMA GENERATED, each of which would have lost something:
--
--   1. **The backfill.** Added in full (steps 2, 4 and 6 below). The role enum's values are
--      already the catalogue's slugs (`frontend`, `backend`, `qa`); the level enum's are not —
--      `intern_junior` is the slug `intern-junior` — so levels map through
--      `replace(value, '_', '-')` and roles map straight across.
--
--   2. **`tracks_one_published_per_role_level` is recreated** (step 8). Prisma never proposed
--      dropping it, because it cannot see a partial index — but it did not have to: the index is
--      built on `tracks."role"` and `tracks."level"`, and `DROP COLUMN` takes every index that
--      depends on the column with it. This is the hand-written-SQL trap from CLAUDE.md in a new
--      shape: not a `DROP INDEX` to delete from the generated file, but a silent cascade. Without
--      this step the "at most one published track per role and level" rule would be gone, with
--      nothing failing until two published tracks collided in the candidate API.
--
--   3. **`questions_embedding_hnsw` is left alone.** This migration does not touch the `embedding`
--      column and must not drop its index (ADR-0006). Verified present after applying.
--
-- Every mapping is checked before anything is dropped: if a single row or array element cannot be
-- resolved to a catalogue row, the migration raises and the whole transaction rolls back, naming
-- what it could not map. Nothing is guessed and nothing is deleted.

-- -----------------------------------------------------------------------------------------------
-- 1. Add the new columns, nullable for now.

ALTER TABLE "profiles" ADD COLUMN "target_role_id" UUID;
ALTER TABLE "profiles" ADD COLUMN "target_level_id" UUID;
ALTER TABLE "tracks" ADD COLUMN "role_id" UUID;
ALTER TABLE "tracks" ADD COLUMN "level_id" UUID;

-- -----------------------------------------------------------------------------------------------
-- 2. Backfill profiles and tracks from the enums, by slug.

UPDATE "profiles" p
SET "target_role_id" = cr."id"
FROM "career_roles" cr
WHERE cr."slug" = p."target_role"::text;

UPDATE "profiles" p
SET "target_level_id" = cl."id"
FROM "career_levels" cl
WHERE cl."slug" = replace(p."level"::text, '_', '-');

UPDATE "tracks" t
SET "role_id" = cr."id"
FROM "career_roles" cr
WHERE cr."slug" = t."role"::text;

UPDATE "tracks" t
SET "level_id" = cl."id"
FROM "career_levels" cl
WHERE cl."slug" = replace(t."level"::text, '_', '-');

-- -----------------------------------------------------------------------------------------------
-- 3. Stop if anything failed to map, naming the values that have no catalogue row. A missing row
--    here means the catalogue does not yet contain a role or level that content already uses;
--    the fix is to add it (in `content/seed`, or the CMS) and run this again — never to guess.

DO $$
DECLARE
  unmapped text;
BEGIN
  SELECT string_agg(DISTINCT detail, ', ') INTO unmapped FROM (
    SELECT 'profiles.target_role=' || "target_role"::text AS detail
      FROM "profiles" WHERE "target_role_id" IS NULL
    UNION ALL
    SELECT 'profiles.level=' || "level"::text
      FROM "profiles" WHERE "target_level_id" IS NULL
    UNION ALL
    SELECT 'tracks.role=' || "role"::text
      FROM "tracks" WHERE "role_id" IS NULL
    UNION ALL
    SELECT 'tracks.level=' || "level"::text
      FROM "tracks" WHERE "level_id" IS NULL
  ) AS problems;

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION
      'catalogue switch aborted: no career_roles/career_levels row for %. Add the missing catalogue rows, then migrate again.',
      unmapped;
  END IF;
END $$;

ALTER TABLE "profiles" ALTER COLUMN "target_role_id" SET NOT NULL;
ALTER TABLE "profiles" ALTER COLUMN "target_level_id" SET NOT NULL;
ALTER TABLE "tracks" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "tracks" ALTER COLUMN "level_id" SET NOT NULL;

-- -----------------------------------------------------------------------------------------------
-- 4. The question join tables, replacing the two enum array columns.

CREATE TABLE "question_career_roles" (
    "question_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "question_career_roles_pkey" PRIMARY KEY ("question_id","role_id")
);

CREATE TABLE "question_career_levels" (
    "question_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,

    CONSTRAINT "question_career_levels_pkey" PRIMARY KEY ("question_id","level_id")
);

-- -----------------------------------------------------------------------------------------------
-- 5. Backfill them from the arrays. `DISTINCT` because the array column never enforced uniqueness
--    and the primary key does; a question listing a role twice is a typo, not data to preserve.

INSERT INTO "question_career_roles" ("question_id", "role_id")
SELECT DISTINCT q."id", cr."id"
FROM "questions" q
CROSS JOIN LATERAL unnest(q."roles") AS value
JOIN "career_roles" cr ON cr."slug" = value::text;

INSERT INTO "question_career_levels" ("question_id", "level_id")
SELECT DISTINCT q."id", cl."id"
FROM "questions" q
CROSS JOIN LATERAL unnest(q."levels") AS value
JOIN "career_levels" cl ON cl."slug" = replace(value::text, '_', '-');

-- -----------------------------------------------------------------------------------------------
-- 6. Stop if any array element was dropped on the way. An INNER JOIN silently skips what it
--    cannot match, so the count is the check: every distinct (question, role) pair that existed
--    in the array must exist as a row.

DO $$
DECLARE
  expected_roles  bigint;
  actual_roles    bigint;
  expected_levels bigint;
  actual_levels   bigint;
  unmapped        text;
BEGIN
  SELECT count(*) INTO expected_roles
    FROM (SELECT DISTINCT q."id", value::text FROM "questions" q,
          unnest(q."roles") AS value) AS pairs;
  SELECT count(*) INTO actual_roles FROM "question_career_roles";

  SELECT count(*) INTO expected_levels
    FROM (SELECT DISTINCT q."id", value::text FROM "questions" q,
          unnest(q."levels") AS value) AS pairs;
  SELECT count(*) INTO actual_levels FROM "question_career_levels";

  IF expected_roles <> actual_roles OR expected_levels <> actual_levels THEN
    SELECT string_agg(DISTINCT detail, ', ') INTO unmapped FROM (
      SELECT 'questions.roles=' || value::text AS detail
        FROM "questions" q, unnest(q."roles") AS value
        WHERE NOT EXISTS (SELECT 1 FROM "career_roles" cr WHERE cr."slug" = value::text)
      UNION ALL
      SELECT 'questions.levels=' || value::text
        FROM "questions" q, unnest(q."levels") AS value
        WHERE NOT EXISTS (
          SELECT 1 FROM "career_levels" cl WHERE cl."slug" = replace(value::text, '_', '-'))
    ) AS problems;

    RAISE EXCEPTION
      'catalogue switch aborted: % of % question role links and % of % level links mapped; unmatched: %',
      actual_roles, expected_roles, actual_levels, expected_levels, coalesce(unmapped, 'none');
  END IF;
END $$;

-- -----------------------------------------------------------------------------------------------
-- 7. Only now: drop the old columns and the enums they used.
--    `tracks_role_level_status_idx` and `tracks_one_published_per_role_level` go with the columns.

DROP INDEX "tracks_role_level_status_idx";

ALTER TABLE "profiles" DROP COLUMN "target_role", DROP COLUMN "level";
ALTER TABLE "tracks" DROP COLUMN "role", DROP COLUMN "level";
ALTER TABLE "questions" DROP COLUMN "roles", DROP COLUMN "levels";

DROP TYPE "target_role";
DROP TYPE "experience_level";

-- -----------------------------------------------------------------------------------------------
-- 8. Indexes and foreign keys.

-- CreateIndex
CREATE INDEX "question_career_roles_role_id_idx" ON "question_career_roles"("role_id");

-- CreateIndex
CREATE INDEX "question_career_levels_level_id_idx" ON "question_career_levels"("level_id");

-- CreateIndex
CREATE INDEX "profiles_target_role_id_idx" ON "profiles"("target_role_id");

-- CreateIndex
CREATE INDEX "profiles_target_level_id_idx" ON "profiles"("target_level_id");

-- CreateIndex
CREATE INDEX "tracks_role_id_level_id_status_idx" ON "tracks"("role_id", "level_id", "status");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_target_role_id_fkey" FOREIGN KEY ("target_role_id") REFERENCES "career_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_target_level_id_fkey" FOREIGN KEY ("target_level_id") REFERENCES "career_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "career_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "career_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_career_roles" ADD CONSTRAINT "question_career_roles_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_career_roles" ADD CONSTRAINT "question_career_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "career_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_career_levels" ADD CONSTRAINT "question_career_levels_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_career_levels" ADD CONSTRAINT "question_career_levels_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "career_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written, below the generated statements (ADR-0014, ADR-0015).

-- At most one published track per role and level, so the candidate API always finds exactly one.
-- Partial, so drafts and retired tracks for the same pair are unrestricted. Recreated here on the
-- new columns: the original was built on `role` and `level` and was dropped with them in step 7.
CREATE UNIQUE INDEX "tracks_one_published_per_role_level" ON "tracks" ("role_id", "level_id")
  WHERE "status" = 'published';

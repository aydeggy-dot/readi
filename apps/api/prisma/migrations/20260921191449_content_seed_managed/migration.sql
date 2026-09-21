-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "seed_managed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "modules" ADD COLUMN     "seed_managed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "seed_managed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "rubrics" ADD COLUMN     "seed_managed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "topics" ADD COLUMN     "seed_managed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "seed_managed" BOOLEAN NOT NULL DEFAULT false;

-- Hand-written, below the generated statements (ADR-0014 decision 5).
--
-- Two edits to what Prisma generated:
--
-- 1. Its `DROP INDEX "questions_embedding_hnsw"` was removed. Prisma cannot see an index on an
--    Unsupported column, so it proposes dropping the hand-written HNSW index in every migration
--    that touches `questions`. Dropping it would silently turn near-duplicate search into a
--    sequential scan (ADR-0006).
-- 2. The backfill below. `false` is the right default for a row the CMS creates, but every row
--    that exists when this migration runs was written by the seed importer — the CMS did not
--    exist before it — so they keep their files as the source of their content.
--    `created_by_user_id IS NULL` is exactly "written by the system actor"; topics and modules
--    have no authorship column, and nothing but the importer has ever created one.
UPDATE "tracks" SET "seed_managed" = true WHERE "created_by_user_id" IS NULL;
UPDATE "lessons" SET "seed_managed" = true WHERE "created_by_user_id" IS NULL;
UPDATE "rubrics" SET "seed_managed" = true WHERE "created_by_user_id" IS NULL;
UPDATE "questions" SET "seed_managed" = true WHERE "created_by_user_id" IS NULL;
UPDATE "topics" SET "seed_managed" = true;
UPDATE "modules" SET "seed_managed" = true;

-- Review state for the publishable content entities (ADR-0014 decision 6).
--
-- `author: ai_draft` lived only in the seed YAML, so once content was imported nothing in the
-- database could tell a model's draft from a question a person had vouched for. `seed_managed` is
-- a different fact (who owns the words) and stays true after an expert reviews a bank in the
-- files, so the review state needs its own column.
--
-- `reviewed_by_user_id` is a plain uuid with NO foreign key, like the other authorship columns:
-- content outlives the account that wrote it, so erasure replaces the id with a tombstone
-- (ADR-0011). It is listed in TOMBSTONED_COLUMNS.
--
-- NOTE: Prisma proposes `DROP INDEX questions_embedding_hnsw` in every migration that touches
-- `questions`, because it cannot see an index over an `Unsupported` column. It is removed by hand
-- here, as in `content_seed_managed`.

-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by_user_id" UUID;

-- AlterTable
ALTER TABLE "lessons" ADD COLUMN     "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by_user_id" UUID;

-- AlterTable
ALTER TABLE "rubrics" ADD COLUMN     "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by_user_id" UUID;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(6),
ADD COLUMN     "reviewed_by_user_id" UUID;

-- Backfill. Everything the importer has written so far came from a file whose `author` is
-- `ai_draft` — that is the only author the shipped corpus uses — so every row `/content/seed`
-- still owns is an unreviewed draft. Anything authored in the CMS was written by a person and
-- keeps the `false` default.
UPDATE "tracks"    SET "ai_draft_unreviewed" = true WHERE "seed_managed";
UPDATE "lessons"   SET "ai_draft_unreviewed" = true WHERE "seed_managed";
UPDATE "rubrics"   SET "ai_draft_unreviewed" = true WHERE "seed_managed";
UPDATE "questions" SET "ai_draft_unreviewed" = true WHERE "seed_managed";

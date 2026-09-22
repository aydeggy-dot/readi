-- The catalogue (ADR-0015): career roles, career levels and stacks become content, with the same
-- workflow, version history, audit trail and review state as a question.
--
-- Nothing points at these tables yet. `tracks`, `questions` and `profiles` still carry the
-- `target_role` / `experience_level` enums and move onto the catalogue in M2.5 phase 3, so this
-- migration adds and never rewrites: an existing database keeps working unchanged.
--
-- `created_by_user_id` and `reviewed_by_user_id` are plain uuids with NO foreign key, like the
-- other authorship columns: content outlives the account that wrote it, so erasure replaces them
-- with a tombstone id (ADR-0011). Both are listed in TOMBSTONED_COLUMNS for each of the three
-- tables, and a schema test fails if one is missing.
--
-- Two things were removed from what Prisma generated:
--   * `DROP INDEX questions_embedding_hnsw` — proposed in every migration because Prisma cannot
--     see an index over an `Unsupported` column, as in `content_seed_managed` and
--     `content_review_state`. This migration does not touch `questions` at all.
--   * the "PostgreSQL 11 and earlier" warning above the enum values; we are on 16 (ADR-0001), and
--     adding a value in a transaction is only a problem if the same transaction *uses* it.

-- AlterEnum
ALTER TYPE "content_entity_type" ADD VALUE 'career_role';
ALTER TYPE "content_entity_type" ADD VALUE 'career_level';
ALTER TYPE "content_entity_type" ADD VALUE 'stack';

-- CreateTable
CREATE TABLE "career_roles" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "position" INTEGER NOT NULL,
    "supported_question_types" "question_type"[],
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seed_managed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "career_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_levels" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "rank" INTEGER NOT NULL,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seed_managed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "career_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stacks" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "seed_managed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "ai_draft_unreviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_role_levels" (
    "role_id" UUID NOT NULL,
    "level_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "career_role_levels_pkey" PRIMARY KEY ("role_id","level_id")
);

-- CreateTable
CREATE TABLE "career_role_stacks" (
    "role_id" UUID NOT NULL,
    "stack_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL,

    CONSTRAINT "career_role_stacks_pkey" PRIMARY KEY ("role_id","stack_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "career_roles_slug_key" ON "career_roles"("slug");

-- CreateIndex
CREATE INDEX "career_roles_status_idx" ON "career_roles"("status");

-- CreateIndex
CREATE INDEX "career_roles_updated_at_id_idx" ON "career_roles"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "career_levels_slug_key" ON "career_levels"("slug");

-- CreateIndex
CREATE INDEX "career_levels_status_idx" ON "career_levels"("status");

-- CreateIndex
CREATE INDEX "career_levels_updated_at_id_idx" ON "career_levels"("updated_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stacks_slug_key" ON "stacks"("slug");

-- CreateIndex
CREATE INDEX "stacks_status_idx" ON "stacks"("status");

-- CreateIndex
CREATE INDEX "stacks_updated_at_id_idx" ON "stacks"("updated_at", "id");

-- CreateIndex
CREATE INDEX "career_role_levels_level_id_idx" ON "career_role_levels"("level_id");

-- CreateIndex
CREATE INDEX "career_role_stacks_stack_id_idx" ON "career_role_stacks"("stack_id");

-- AddForeignKey
ALTER TABLE "career_role_levels" ADD CONSTRAINT "career_role_levels_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "career_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_role_levels" ADD CONSTRAINT "career_role_levels_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "career_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_role_stacks" ADD CONSTRAINT "career_role_stacks_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "career_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_role_stacks" ADD CONSTRAINT "career_role_stacks_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "stacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

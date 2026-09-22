-- The stack dimension (M2.5 phase 4, ADR-0015): which variant a question is for, and which one a
-- candidate is interviewing for.
--
-- HAND-WRITTEN, for one reason: Prisma proposed `ALTER TABLE "profiles" DROP COLUMN "stack", ADD
-- COLUMN "technologies" TEXT[]`, which is a rename written as data loss — it would have emptied
-- the technologies list of every candidate who has completed onboarding. A rename is a rename.
--
-- Nothing here touches `questions` or `tracks`, so neither `questions_embedding_hnsw` nor
-- `tracks_one_published_per_role_level` is at risk; checked against the diff, which proposed no
-- DROP INDEX and no other DROP COLUMN (CLAUDE.md "Data access").

-- `stack` (what the candidate knows, free text) becomes `technologies`, with its data.
ALTER TABLE "profiles" RENAME COLUMN "stack" TO "technologies";

-- `target_stack_id` (which variant they are interviewing for) is new, and nullable: a role need
-- not offer any variants, and a candidate who has not chosen one has not answered wrongly.
ALTER TABLE "profiles" ADD COLUMN "target_stack_id" UUID;

-- CreateTable: no rows for a question means it is general to its role, so this table is read as
-- "only these stacks", never "also these".
CREATE TABLE "question_stacks" (
    "question_id" UUID NOT NULL,
    "stack_id" UUID NOT NULL,

    CONSTRAINT "question_stacks_pkey" PRIMARY KEY ("question_id","stack_id")
);

-- CreateIndex
CREATE INDEX "question_stacks_stack_id_idx" ON "question_stacks"("stack_id");

-- CreateIndex
CREATE INDEX "profiles_target_stack_id_idx" ON "profiles"("target_stack_id");

-- AddForeignKey: RESTRICT, not SET NULL. A stack a candidate is interviewing for cannot be
-- deleted out from under them; the CMS retires content rather than deleting it, and `stack_in_use`
-- refuses even that while a profile still points here.
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_target_stack_id_fkey" FOREIGN KEY ("target_stack_id") REFERENCES "stacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_stacks" ADD CONSTRAINT "question_stacks_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_stacks" ADD CONSTRAINT "question_stacks_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "stacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

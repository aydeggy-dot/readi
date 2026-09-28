-- Evidence that reads like an instruction to the evaluator rather than an answer (M4 phase 3, the
-- owner's decision of 2026-09-27). Our own matched phrases, never the candidate's quote: a flag is a
-- reason for a person to look, it changes no score, and no candidate sees it.
--
-- No backfill and no default: every row of this table is written by the evaluation job, which does
-- not exist before this migration, so there is nothing to backfill. A default would also be drift —
-- the Prisma field has none, and the next `migrate dev` would propose removing it.
--
-- Prisma proposed `DROP INDEX questions_embedding_hnsw` here for the NINTH time, in a migration that
-- adds one column to a table it has never heard of. Deleted; `migration-sql.spec.ts` fails the build
-- if it comes back.

-- AlterTable
ALTER TABLE "answer_evaluations" ADD COLUMN     "evidence_flags" TEXT[];

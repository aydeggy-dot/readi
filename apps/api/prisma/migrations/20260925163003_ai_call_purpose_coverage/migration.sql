-- The follow-up decision is its own AI-call purpose: `coverage` judges whether a probe is still
-- worth asking, `follow_up` phrases the one the engine chose. Two calls, two shapes, and only one
-- of them is skipped when the budget is spent — so `ai_call_log` keeps them apart (M3 phase 2).
--
-- `BEFORE 'follow_up'` so the stored order matches the order `AiCallPurpose` declares them in.
-- AlterEnum
ALTER TYPE "ai_call_purpose" ADD VALUE 'coverage' BEFORE 'follow_up';

-- Prisma also proposed `DROP INDEX "questions_embedding_hnsw"` here, in a migration that adds one
-- enum value and touches no table at all. That is the SIXTH time (CLAUDE.md §5, tasks/lessons.md);
-- it is deleted, and `migration-sql.spec.ts` now fails the build rather than relying on it being
-- spotted by eye.

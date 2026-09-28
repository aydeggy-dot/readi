-- Prompt-cache tokens on `ai_call_log` (2026-09-28, M4 phase 5). The evaluator caches its system
-- prompt, and a write (1.25× the input rate) and a read (0.1×) are billed differently from ordinary
-- input — so they are their own columns and `cost_micro_usd` stays derivable from the row it sits on.
-- `DEFAULT 0` covers every row written before today and every purpose that does not cache.
--
-- Prisma also proposed `DROP INDEX "questions_embedding_hnsw"` here, for the **eleventh** time, in a
-- migration that does not touch `questions`. Deleted. It is hand-written SQL Prisma cannot see
-- (CLAUDE.md "Data access"; `migration-sql.spec.ts` now fails the build on it).
ALTER TABLE "ai_call_log"
  ADD COLUMN "cache_write_units" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cache_read_units" INTEGER NOT NULL DEFAULT 0;

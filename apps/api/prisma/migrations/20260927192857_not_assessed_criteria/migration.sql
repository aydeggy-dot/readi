-- The criteria an answer was **not scored on** (the owner's decision of 2026-09-27, after the first
-- paid evaluation run): the interview never asked about them — they carry a probe and none of it was
-- asked, because the clock ran out, the candidate ended early, or the follow-up cap went elsewhere —
-- and the evaluator found nothing in the answer either. They leave `overall`'s denominator entirely
-- rather than scoring 0. Stored alongside `prompted_criteria` and for the same reason: `overall` was
-- computed against *this* list under the `scoring_version` beside it, so a report that recomputed the
-- set later could name criteria the number never came from.
--
-- No backfill and no default. The rows written before this migration were scored under
-- `scoring_version = 1`, where the rule did not exist, and NULL there is the truth: nothing was
-- excluded because nothing could be. Prisma reads a NULL scalar list as `[]`, which is what the
-- report then says. A default would also be drift — the Prisma field has none, and the next
-- `migrate dev` would propose removing it.
--
-- Prisma proposed `DROP INDEX questions_embedding_hnsw` here for the TENTH time, in a migration that
-- adds one column to a table it has never heard of. Deleted; `migration-sql.spec.ts` fails the build
-- if it comes back.

-- AlterTable
ALTER TABLE "answer_evaluations" ADD COLUMN     "not_assessed_criteria" INTEGER[];

-- The consent that lets a person on our team read a candidate's interview answers, so the model's
-- scoring can be checked against a human's (spec §90, ADR-0017). Optional, default off, and every
-- existing account is asked once because `ConsentsService.allDecided` requires an answer to each type.
--
-- Nothing in this migration reads the new value, which is what makes it safe inside Prisma's
-- transaction: Postgres forbids using an enum value added in the same transaction, not adding one.
-- AlterEnum
ALTER TYPE "consent_type" ADD VALUE 'transcript_review';

-- Prisma proposed `DROP INDEX questions_embedding_hnsw` here as well, in a migration that touches
-- nothing but an enum. That is the SEVENTH time (CLAUDE.md §5 "Data access"): the index is
-- hand-written SQL over a column Prisma cannot model, so every diff wants it gone. Deleted, and
-- `migration-sql.spec.ts` would have failed the build if it had not been.

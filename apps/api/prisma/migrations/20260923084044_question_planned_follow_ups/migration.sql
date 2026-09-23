-- Planned follow-ups: the probe the engine may ask for each rubric criterion the opening prompt
-- does not ask for (owner's decision, 2026-09-23). Answer-key material, so it lives beside
-- `ideal_points` and never reaches a candidate-facing response.
--
-- Prisma also generated `DROP INDEX "questions_embedding_hnsw"` here, for the fourth time, in a
-- migration that touches nothing to do with the vector. Deleted, per CLAUDE.md §5.
ALTER TABLE "questions" ADD COLUMN "planned_follow_ups" JSONB NOT NULL DEFAULT '[]';

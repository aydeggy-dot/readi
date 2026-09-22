-- The CMS lists order by `updated_at DESC, id DESC` with a keyset cursor, and nothing indexed it:
-- every page of every list sorted the whole table. `questions` and `lessons` are the tables meant
-- to grow into thousands of rows, and an unfiltered list is the CMS's landing page.
--
-- NOTE: Prisma proposes `DROP INDEX questions_embedding_hnsw` in every migration that touches
-- `questions`, because it cannot see an index over an `Unsupported` column. Removed by hand, as in
-- `content_seed_managed` and `content_review_state`; `content-schema.int.spec.ts` fails if it ever
-- goes through.

-- CreateIndex
CREATE INDEX "tracks_updated_at_id_idx" ON "tracks"("updated_at", "id");

-- CreateIndex
CREATE INDEX "lessons_updated_at_id_idx" ON "lessons"("updated_at", "id");

-- CreateIndex
CREATE INDEX "rubrics_updated_at_id_idx" ON "rubrics"("updated_at", "id");

-- CreateIndex
CREATE INDEX "questions_updated_at_id_idx" ON "questions"("updated_at", "id");

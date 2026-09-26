-- The interview engine (M3): sessions, the questions they pinned, and their transcripts.
--
-- Prisma also generated `DROP INDEX "questions_embedding_hnsw"` here, for the FIFTH time, in a
-- migration that creates three new tables and touches nothing to do with the vector. It cannot see
-- an index over an `Unsupported` column, so it proposes dropping it in every migration. Deleted,
-- per CLAUDE.md §5; `content-schema.int.spec.ts` is what would notice if it ever shipped.

-- CreateEnum
CREATE TYPE "interview_state" AS ENUM ('intro', 'question', 'follow_up', 'candidate_questions', 'wrap_up', 'ended');

-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('in_progress', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "interview_mode" AS ENUM ('text', 'voice');

-- CreateEnum
CREATE TYPE "interview_persona" AS ENUM ('friendly');

-- CreateEnum
CREATE TYPE "turn_speaker" AS ENUM ('interviewer', 'candidate');

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "career_role_id" UUID NOT NULL,
    "role_version" INTEGER NOT NULL,
    "career_level_id" UUID NOT NULL,
    "level_version" INTEGER NOT NULL,
    "stack_id" UUID,
    "stack_version" INTEGER,
    "types" "question_type"[],
    "mode" "interview_mode" NOT NULL DEFAULT 'text',
    "persona" "interview_persona" NOT NULL DEFAULT 'friendly',
    "is_diagnostic" BOOLEAN NOT NULL DEFAULT false,
    "planned_minutes" INTEGER NOT NULL,
    "question_budget" INTEGER NOT NULL,
    "max_follow_ups" INTEGER NOT NULL,
    "state" "interview_state" NOT NULL DEFAULT 'intro',
    "status" "interview_status" NOT NULL DEFAULT 'in_progress',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "catalogue" JSONB NOT NULL,
    "selection_seed" TEXT NOT NULL,
    "prompt_versions" JSONB NOT NULL,
    "model_config" JSONB NOT NULL,
    "engine_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_session_questions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "question_id" UUID NOT NULL,
    "question_version" INTEGER NOT NULL,
    "rubric_id" UUID NOT NULL,
    "rubric_version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "asked_at" TIMESTAMPTZ(6),
    "follow_ups_asked" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_session_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_turns" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker" "turn_speaker" NOT NULL,
    "state" "interview_state" NOT NULL,
    "session_question_id" UUID,
    "follow_up_index" INTEGER,
    "text" TEXT NOT NULL,
    "started_ms" INTEGER NOT NULL,
    "ended_ms" INTEGER NOT NULL,
    "stt_confidence" DOUBLE PRECISION,
    "criteria_covered" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_updated_at_id_idx" ON "interview_sessions"("user_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "interview_sessions_status_ends_at_idx" ON "interview_sessions"("status", "ends_at");

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_started_at_idx" ON "interview_sessions"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "interview_session_questions_question_id_idx" ON "interview_session_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_session_questions_session_id_position_key" ON "interview_session_questions"("session_id", "position");

-- CreateIndex
CREATE INDEX "session_turns_session_question_id_idx" ON "session_turns"("session_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_turns_session_id_seq_key" ON "session_turns"("session_id", "seq");

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_career_role_id_fkey" FOREIGN KEY ("career_role_id") REFERENCES "career_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_career_level_id_fkey" FOREIGN KEY ("career_level_id") REFERENCES "career_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_stack_id_fkey" FOREIGN KEY ("stack_id") REFERENCES "stacks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session_questions" ADD CONSTRAINT "interview_session_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session_questions" ADD CONSTRAINT "interview_session_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_session_questions" ADD CONSTRAINT "interview_session_questions_rubric_id_fkey" FOREIGN KEY ("rubric_id") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_turns" ADD CONSTRAINT "session_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_turns" ADD CONSTRAINT "session_turns_session_question_id_fkey" FOREIGN KEY ("session_question_id") REFERENCES "interview_session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

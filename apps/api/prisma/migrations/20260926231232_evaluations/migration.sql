-- CreateEnum
CREATE TYPE "evaluation_status" AS ENUM ('ok', 'failed');

-- CreateEnum
CREATE TYPE "evaluation_confidence" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "session_report_status" AS ENUM ('ready', 'partial', 'failed');

-- Prisma proposed `DROP INDEX questions_embedding_hnsw` here. That is the EIGHTH time
-- (CLAUDE.md §5 "Data access"), and the second today: this migration creates three tables and
-- touches `questions` not at all. Deleted; `migration-sql.spec.ts` fails the build if it is not.

-- CreateTable
CREATE TABLE "answer_evaluations" (
    "id" UUID NOT NULL,
    "session_question_id" UUID NOT NULL,
    "status" "evaluation_status" NOT NULL,
    "criteria" JSONB,
    "covered_points" TEXT[],
    "missing_points" TEXT[],
    "strengths" TEXT[],
    "improvement_tip" TEXT,
    "red_flags" TEXT[],
    "confidence" "evaluation_confidence",
    "overall" INTEGER,
    "overall_raw" INTEGER,
    "prompted_criteria" INTEGER[],
    "scoring_version" INTEGER NOT NULL,
    "evaluator_provider" TEXT NOT NULL,
    "evaluator_model" TEXT NOT NULL,
    "prompt_versions" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "answer_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_reports" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" "session_report_status" NOT NULL,
    "overall" INTEGER,
    "scored_answers" INTEGER NOT NULL,
    "total_answers" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "scoring_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calibration_scores" (
    "id" UUID NOT NULL,
    "answer_evaluation_id" UUID NOT NULL,
    "expert_user_id" UUID NOT NULL,
    "criteria" JSONB NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "answer_evaluations_session_question_id_key" ON "answer_evaluations"("session_question_id");

-- CreateIndex
CREATE INDEX "answer_evaluations_status_created_at_idx" ON "answer_evaluations"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_reports_session_id_key" ON "session_reports"("session_id");

-- CreateIndex
CREATE INDEX "calibration_scores_expert_user_id_idx" ON "calibration_scores"("expert_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calibration_scores_answer_evaluation_id_expert_user_id_key" ON "calibration_scores"("answer_evaluation_id", "expert_user_id");

-- AddForeignKey
ALTER TABLE "answer_evaluations" ADD CONSTRAINT "answer_evaluations_session_question_id_fkey" FOREIGN KEY ("session_question_id") REFERENCES "interview_session_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reports" ADD CONSTRAINT "session_reports_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calibration_scores" ADD CONSTRAINT "calibration_scores_answer_evaluation_id_fkey" FOREIGN KEY ("answer_evaluation_id") REFERENCES "answer_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

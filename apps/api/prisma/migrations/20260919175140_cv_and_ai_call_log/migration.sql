-- CreateEnum
CREATE TYPE "cv_status" AS ENUM ('none', 'processing', 'parsed', 'unreadable', 'failed');

-- CreateEnum
CREATE TYPE "ai_call_purpose" AS ENUM ('interviewer', 'follow_up', 'evaluator', 'cv_parse', 'plan_summary', 'embedding', 'stt', 'tts', 'avatar');

-- CreateEnum
CREATE TYPE "ai_unit_kind" AS ENUM ('tokens', 'characters', 'seconds');

-- CreateEnum
CREATE TYPE "ai_call_status" AS ENUM ('ok', 'error');

-- AlterTable
ALTER TABLE "profiles" ADD COLUMN     "cv_content_type" TEXT,
ADD COLUMN     "cv_edited_at" TIMESTAMPTZ(6),
ADD COLUMN     "cv_error" TEXT,
ADD COLUMN     "cv_file_key" TEXT,
ADD COLUMN     "cv_parsed" JSONB,
ADD COLUMN     "cv_parsed_at" TIMESTAMPTZ(6),
ADD COLUMN     "cv_status" "cv_status" NOT NULL DEFAULT 'none',
ADD COLUMN     "cv_uploaded_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "ai_call_log" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" UUID,
    "user_id" UUID,
    "purpose" "ai_call_purpose" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "ai_call_status" NOT NULL,
    "error_code" TEXT,
    "latency_ms" INTEGER NOT NULL,
    "input_units" INTEGER NOT NULL,
    "output_units" INTEGER NOT NULL,
    "unit_kind" "ai_unit_kind" NOT NULL,
    "cost_micro_usd" BIGINT NOT NULL,
    "langfuse_trace_id" TEXT,

    CONSTRAINT "ai_call_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_call_log_user_id_idx" ON "ai_call_log"("user_id");

-- CreateIndex
CREATE INDEX "ai_call_log_session_id_idx" ON "ai_call_log"("session_id");

-- CreateIndex
CREATE INDEX "ai_call_log_created_at_idx" ON "ai_call_log"("created_at");

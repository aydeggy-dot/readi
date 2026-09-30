-- CreateEnum
CREATE TYPE "voice_leg_end_reason" AS ENUM ('completed', 'fallback_poor_connection', 'candidate_left', 'agent_error', 'session_expired', 'allowance_exhausted');

-- CreateEnum
CREATE TYPE "usage_kind" AS ENUM ('voice_seconds', 'avatar_seconds');

-- Prisma proposed `DROP INDEX "questions_embedding_hnsw"` here and it has been deleted, for the
-- sixth time (CLAUDE.md "Data access"). Prisma cannot see the objects it does not model, so every
-- generated migration offers to drop that hand-written HNSW index — including this one, which
-- touches neither `questions` nor a vector. `migration-sql.spec.ts` would fail the build if it
-- were left in; dropping it breaks nothing visibly, which is why it needs a test and not eyes.

-- AlterTable
ALTER TABLE "session_turns" ADD COLUMN     "interrupted" BOOLEAN,
ADD COLUMN     "spoken_ms" INTEGER,
ADD COLUMN     "voice_words" JSONB;

-- CreateTable
CREATE TABLE "voice_exchanges" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_exchanges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_legs" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "reason" "voice_leg_end_reason" NOT NULL,
    "voice_seconds" INTEGER NOT NULL,
    "turns_spoken" INTEGER NOT NULL,
    "rtt_ms_p50" INTEGER,
    "rtt_ms_p95" INTEGER,
    "packet_loss_percent" DOUBLE PRECISION,
    "reconnects" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_turn_latency" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "turn_seq" INTEGER NOT NULL,
    "speech_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "endpoint_ms" INTEGER NOT NULL,
    "stt_final_ms" INTEGER NOT NULL,
    "acknowledged_ms" INTEGER,
    "coverage_ms" INTEGER,
    "phrasing_ms" INTEGER,
    "tts_first_byte_ms" INTEGER,
    "response_ms" INTEGER NOT NULL,
    "prefetched" BOOLEAN NOT NULL,
    "interim_coverage" BOOLEAN NOT NULL,
    "interrupted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_turn_latency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_ledger" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID,
    "kind" "usage_kind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "source_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "voice_exchanges_session_id_idx" ON "voice_exchanges"("session_id");

-- CreateIndex
CREATE INDEX "voice_legs_session_id_idx" ON "voice_legs"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "voice_turn_latency_session_id_turn_seq_key" ON "voice_turn_latency"("session_id", "turn_seq");

-- CreateIndex
CREATE UNIQUE INDEX "usage_ledger_source_id_key" ON "usage_ledger"("source_id");

-- CreateIndex
CREATE INDEX "usage_ledger_user_id_kind_occurred_at_idx" ON "usage_ledger"("user_id", "kind", "occurred_at");

-- CreateIndex
CREATE INDEX "usage_ledger_session_id_idx" ON "usage_ledger"("session_id");

-- AddForeignKey
ALTER TABLE "voice_exchanges" ADD CONSTRAINT "voice_exchanges_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_legs" ADD CONSTRAINT "voice_legs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_turn_latency" ADD CONSTRAINT "voice_turn_latency_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

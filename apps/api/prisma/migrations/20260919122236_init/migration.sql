-- Enable pgvector (vector columns + HNSW indexes arrive in M2, ADR-0006).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "health_check" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_check_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "target_role" AS ENUM ('frontend', 'backend', 'qa');

-- CreateEnum
CREATE TYPE "experience_level" AS ENUM ('intern_junior', 'mid');

-- CreateEnum
CREATE TYPE "target_company_type" AS ENUM ('local_startup', 'enterprise_bank_telco', 'remote_foreign', 'big_tech');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('audio_processing', 'recording_storage', 'camera_coaching', 'marketing');

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "target_role" "target_role" NOT NULL,
    "level" "experience_level" NOT NULL,
    "years_experience" INTEGER NOT NULL,
    "stack" TEXT[],
    "target_company_type" "target_company_type" NOT NULL,
    "target_date" DATE,
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "consent_type" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_records_user_id_type_created_at_idx" ON "consent_records"("user_id", "type", "created_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

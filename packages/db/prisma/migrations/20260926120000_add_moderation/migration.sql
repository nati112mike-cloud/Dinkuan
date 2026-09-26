-- CreateEnum
CREATE TYPE "ModAction" AS ENUM ('remove', 'age_restrict', 'warn', 'suspend', 'ban', 'dismiss');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('open', 'upheld', 'overturned');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'mod_removed';
ALTER TYPE "NotificationType" ADD VALUE 'mod_age_restricted';
ALTER TYPE "NotificationType" ADD VALUE 'mod_warned';
ALTER TYPE "NotificationType" ADD VALUE 'mod_suspended';
ALTER TYPE "NotificationType" ADD VALUE 'mod_banned';
ALTER TYPE "NotificationType" ADD VALUE 'mod_takedown';
ALTER TYPE "NotificationType" ADD VALUE 'appeal_upheld';
ALTER TYPE "NotificationType" ADD VALUE 'appeal_overturned';

-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "removed_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "age_restricted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "action_id" UUID,
ADD COLUMN     "resolved_at" TIMESTAMPTZ,
ADD COLUMN     "severity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "subject_id" UUID,
ALTER COLUMN "reporter_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "removed_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "banned_at" TIMESTAMPTZ,
ADD COLUMN     "suspended_until" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "subject_id" UUID,
    "action" "ModAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "before" JSONB,
    "overturned_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strikes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "severe" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "strikes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "action_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'open',
    "reviewer_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_actions_subject_id_created_at_idx" ON "moderation_actions"("subject_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "strikes_action_id_key" ON "strikes"("action_id");

-- CreateIndex
CREATE INDEX "strikes_user_id_created_at_idx" ON "strikes"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "appeals_action_id_key" ON "appeals"("action_id");

-- CreateIndex
CREATE INDEX "appeals_status_created_at_idx" ON "appeals"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- One report per person per target: keep the earliest of any duplicates filed before this rule.
DELETE FROM "reports" a USING "reports" b
WHERE a."reporter_id" = b."reporter_id" AND a."target_type" = b."target_type" AND a."target_id" = b."target_id"
  AND (a."created_at", a."id") > (b."created_at", b."id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_target_type_target_id_key" ON "reports"("reporter_id", "target_type", "target_id");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "moderation_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strikes" ADD CONSTRAINT "strikes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strikes" ADD CONSTRAINT "strikes_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "moderation_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "moderation_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "media_url_idx" ON "media"("url");

-- CreateIndex
CREATE INDEX "media_thumb_url_idx" ON "media"("thumb_url");

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('pending', 'sent', 'failed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'organiser_approved';
ALTER TYPE "NotificationType" ADD VALUE 'organiser_rejected';
ALTER TYPE "NotificationType" ADD VALUE 'event_approved';
ALTER TYPE "NotificationType" ADD VALUE 'event_rejected';
ALTER TYPE "NotificationType" ADD VALUE 'team_added';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "review_note" TEXT;

-- AlterTable
ALTER TABLE "organisers" ADD COLUMN     "reject_reason" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ,
ADD COLUMN     "submitted_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_login_tokens" (
    "token_hash" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,

    CONSTRAINT "telegram_login_tokens_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_dedupe_key_key" ON "outbound_messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "outbound_messages_status_created_at_idx" ON "outbound_messages"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_chat_id_key" ON "users"("telegram_chat_id");

-- AddForeignKey
ALTER TABLE "outbound_messages" ADD CONSTRAINT "outbound_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_login_tokens" ADD CONSTRAINT "telegram_login_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


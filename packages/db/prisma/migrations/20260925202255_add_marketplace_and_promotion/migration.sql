-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('dj', 'photographer', 'videographer', 'planner', 'mc', 'decor', 'sound_lighting', 'makeup', 'band');

-- CreateEnum
CREATE TYPE "VendorLevel" AS ENUM ('new', 'rising', 'top_rated', 'pro');

-- CreateEnum
CREATE TYPE "GigStatus" AS ENUM ('none', 'pending', 'verified', 'declined');

-- CreateEnum
CREATE TYPE "PackageTier" AS ENUM ('basic', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "AvailabilityReason" AS ENUM ('blocked', 'booked');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('requested', 'offered', 'confirmed', 'completed', 'reviewed', 'cancelled', 'disputed');

-- CreateEnum
CREATE TYPE "PromoTarget" AS ENUM ('event', 'post', 'profile', 'package');

-- CreateEnum
CREATE TYPE "AdPlacementKey" AS ENUM ('feed', 'reels', 'events_featured', 'home_weekend', 'search_top', 'push');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('pending_payment', 'pending_review', 'active', 'paused', 'ended', 'rejected', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerType" ADD VALUE 'promotion';
ALTER TYPE "LedgerType" ADD VALUE 'promotion_refund';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'booking_request';
ALTER TYPE "NotificationType" ADD VALUE 'message';
ALTER TYPE "NotificationType" ADD VALUE 'gig_tag';
ALTER TYPE "NotificationType" ADD VALUE 'gig_verified';
ALTER TYPE "NotificationType" ADD VALUE 'campaign_live';
ALTER TYPE "NotificationType" ADD VALUE 'campaign_rejected';

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "campaign_id" UUID;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "href" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "campaign_id" UUID;

-- CreateTable
CREATE TABLE "vendor_profiles" (
    "user_id" UUID NOT NULL,
    "types" "VendorType"[],
    "headline" TEXT NOT NULL,
    "about" TEXT,
    "years_experience" INTEGER NOT NULL DEFAULT 0,
    "services" TEXT[],
    "genres" TEXT[],
    "languages" TEXT[],
    "areas" TEXT[],
    "equipment" TEXT[],
    "team_size" INTEGER NOT NULL DEFAULT 1,
    "social_links" TEXT[],
    "level" "VendorLevel" NOT NULL DEFAULT 'new',
    "rating_avg" INTEGER NOT NULL DEFAULT 0,
    "rating_count" INTEGER NOT NULL DEFAULT 0,
    "bookings_count" INTEGER NOT NULL DEFAULT 0,
    "requests_count" INTEGER NOT NULL DEFAULT 0,
    "replied_count" INTEGER NOT NULL DEFAULT 0,
    "response_time_min" INTEGER,
    "starting_price_santim" INTEGER,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cover_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "portfolio_albums" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "event_id" UUID,
    "gig_status" "GigStatus" NOT NULL DEFAULT 'none',
    "cover_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_items" (
    "id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "url" TEXT NOT NULL,
    "thumb_url" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "caption" TEXT,
    "order_idx" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_credits" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "event_id" UUID,
    "date" DATE,
    "verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stage_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "tier" "PackageTier" NOT NULL,
    "name" TEXT NOT NULL,
    "price_santim" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL,
    "includes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_addons" (
    "id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_santim" INTEGER NOT NULL,

    CONSTRAINT "package_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_blocks" (
    "vendor_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" "AvailabilityReason" NOT NULL,
    "booking_id" UUID,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("vendor_id","date")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "package_id" UUID,
    "event_date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "guests" INTEGER NOT NULL,
    "budget_santim" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "BookingStatus" NOT NULL DEFAULT 'requested',
    "campaign_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "booking_request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "contact_unlocked" BOOLEAN NOT NULL DEFAULT false,
    "last_message_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_read_at" TIMESTAMPTZ,
    "vendor_read_at" TIMESTAMPTZ,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "original_body" TEXT NOT NULL,
    "masked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "booking_id" UUID,
    "client_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "stars" INTEGER NOT NULL,
    "punctuality" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "communication" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "vendor_reply" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "share_token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_items" (
    "shortlist_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlist_items_pkey" PRIMARY KEY ("shortlist_id","vendor_id")
);

-- CreateTable
CREATE TABLE "promo_packages" (
    "key" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_am" TEXT NOT NULL,
    "price_santim" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "impressions" INTEGER,
    "placements" "AdPlacementKey"[],
    "targets" "PromoTarget"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promo_packages_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ad_placements" (
    "key" "AdPlacementKey" NOT NULL,
    "cpm_santim" INTEGER NOT NULL,
    "min_daily_santim" INTEGER NOT NULL,

    CONSTRAINT "ad_placements_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "advertiser_id" UUID NOT NULL,
    "package_key" TEXT NOT NULL,
    "target_type" "PromoTarget" NOT NULL,
    "target_id" UUID NOT NULL,
    "placements" "AdPlacementKey"[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'pending_payment',
    "budget_santim" INTEGER NOT NULL,
    "refunded_santim" INTEGER NOT NULL DEFAULT 0,
    "impressions_goal" INTEGER,
    "days" INTEGER NOT NULL,
    "gateway" "Gateway" NOT NULL,
    "gateway_ref" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ,
    "ends_at" TIMESTAMPTZ,
    "paid_at" TIMESTAMPTZ,
    "reviewed_by" UUID,
    "review_note" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_impressions" (
    "campaign_id" UUID NOT NULL,
    "viewer_key" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ad_impressions_pkey" PRIMARY KEY ("campaign_id","viewer_key","day","placement")
);

-- CreateTable
CREATE TABLE "ad_clicks" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "viewer_key" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_conversions" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_profiles_quality_score_idx" ON "vendor_profiles"("quality_score");

-- CreateIndex
CREATE INDEX "portfolio_albums_vendor_id_idx" ON "portfolio_albums"("vendor_id");

-- CreateIndex
CREATE INDEX "portfolio_albums_event_id_gig_status_idx" ON "portfolio_albums"("event_id", "gig_status");

-- CreateIndex
CREATE INDEX "portfolio_items_album_id_idx" ON "portfolio_items"("album_id");

-- CreateIndex
CREATE INDEX "stage_credits_vendor_id_idx" ON "stage_credits"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "packages_vendor_id_tier_key" ON "packages"("vendor_id", "tier");

-- CreateIndex
CREATE INDEX "availability_blocks_date_idx" ON "availability_blocks"("date");

-- CreateIndex
CREATE INDEX "booking_requests_vendor_id_created_at_idx" ON "booking_requests"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "booking_requests_client_id_created_at_idx" ON "booking_requests"("client_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_booking_request_id_key" ON "conversations"("booking_request_id");

-- CreateIndex
CREATE INDEX "conversations_client_id_last_message_at_idx" ON "conversations"("client_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_vendor_id_last_message_at_idx" ON "conversations"("vendor_id", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "reviews"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_vendor_id_created_at_idx" ON "reviews"("vendor_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_share_token_key" ON "shortlists"("share_token");

-- CreateIndex
CREATE INDEX "shortlists_user_id_idx" ON "shortlists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_gateway_ref_key" ON "campaigns"("gateway_ref");

-- CreateIndex
CREATE INDEX "campaigns_status_ends_at_idx" ON "campaigns"("status", "ends_at");

-- CreateIndex
CREATE INDEX "campaigns_advertiser_id_created_at_idx" ON "campaigns"("advertiser_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ad_impressions_viewer_key_day_idx" ON "ad_impressions"("viewer_key", "day");

-- CreateIndex
CREATE INDEX "ad_clicks_campaign_id_idx" ON "ad_clicks"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_conversions_campaign_id_type_ref_id_key" ON "ad_conversions"("campaign_id", "type", "ref_id");

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_profiles" ADD CONSTRAINT "vendor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_albums" ADD CONSTRAINT "portfolio_albums_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_albums" ADD CONSTRAINT "portfolio_albums_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "portfolio_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_credits" ADD CONSTRAINT "stage_credits_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_credits" ADD CONSTRAINT "stage_credits_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packages" ADD CONSTRAINT "packages_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_addons" ADD CONSTRAINT "package_addons_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_request_id_fkey" FOREIGN KEY ("booking_request_id") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shortlist_id_fkey" FOREIGN KEY ("shortlist_id") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendor_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiser_id_fkey" FOREIGN KEY ("advertiser_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_package_key_fkey" FOREIGN KEY ("package_key") REFERENCES "promo_packages"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_clicks" ADD CONSTRAINT "ad_clicks_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "Lang" AS ENUM ('am', 'en');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('buyer', 'organiser', 'admin');

-- CreateEnum
CREATE TYPE "OrganiserType" AS ENUM ('business', 'individual');

-- CreateEnum
CREATE TYPE "OrganiserStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "OrganiserMemberRole" AS ENUM ('manager', 'scanner');

-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('nightlife', 'concert', 'festival', 'comedy', 'arts_culture', 'conference', 'sports', 'community', 'holiday');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('draft', 'pending_review', 'published', 'ended', 'cancelled');

-- CreateEnum
CREATE TYPE "RefundPolicy" AS ENUM ('no_refunds', 'refund_until');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('public', 'hidden');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded', 'refund_pending');

-- CreateEnum
CREATE TYPE "Gateway" AS ENUM ('telebirr', 'chapa');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('valid', 'checked_in', 'transferred', 'refunded', 'void');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'done', 'failed');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('sale', 'fee', 'refund', 'payout');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('requested', 'paid', 'rejected');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "lang" "Lang" NOT NULL DEFAULT 'am',
    "telegram_chat_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "user_id" UUID NOT NULL,
    "role" "RoleName" NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "send_count" INTEGER NOT NULL DEFAULT 1,
    "window_start" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "organisers" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "licence_url" TEXT,
    "type" "OrganiserType" NOT NULL,
    "status" "OrganiserStatus" NOT NULL DEFAULT 'draft',
    "payout_method" TEXT,
    "payout_account" TEXT,
    "payout_hold" BOOLEAN NOT NULL DEFAULT true,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organiser_members" (
    "organiser_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrganiserMemberRole" NOT NULL,

    CONSTRAINT "organiser_members_pkey" PRIMARY KEY ("organiser_id","user_id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "organiser_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title_am" TEXT,
    "title_en" TEXT,
    "desc_am" TEXT,
    "desc_en" TEXT,
    "category" "EventCategory" NOT NULL,
    "poster_url" TEXT NOT NULL,
    "venue_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ,
    "lineup" TEXT[],
    "status" "EventStatus" NOT NULL DEFAULT 'draft',
    "refund_policy" "RefundPolicy" NOT NULL DEFAULT 'no_refunds',
    "refund_until" TIMESTAMPTZ,
    "fee_pct_bps" INTEGER NOT NULL DEFAULT 500,
    "fee_fixed_santim" INTEGER NOT NULL DEFAULT 1000,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "signing_public_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_signing_keys" (
    "event_id" UUID NOT NULL,
    "private_key_encrypted" TEXT NOT NULL,

    CONSTRAINT "event_signing_keys_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_santim" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "per_order_max" INTEGER NOT NULL DEFAULT 10,
    "sales_start" TIMESTAMPTZ,
    "sales_end" TIMESTAMPTZ,
    "visibility" "Visibility" NOT NULL DEFAULT 'public',
    "access_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "subtotal_santim" INTEGER NOT NULL,
    "fee_santim" INTEGER NOT NULL,
    "total_santim" INTEGER NOT NULL,
    "gateway" "Gateway" NOT NULL,
    "gateway_ref" TEXT NOT NULL,
    "holds_reservation" BOOLEAN NOT NULL DEFAULT true,
    "promo_code_id" UUID,
    "promoter_link_id" UUID,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price_santim" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "holder_user_id" UUID NOT NULL,
    "holder_name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TicketStatus" NOT NULL DEFAULT 'valid',
    "transfer_count" INTEGER NOT NULL DEFAULT 0,
    "checked_in_at" TIMESTAMPTZ,
    "checked_in_by" UUID,
    "gate" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_transfers" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "gateway" "Gateway" NOT NULL,
    "gateway_ref" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "signature_ok" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "amount_santim" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "gateway_ref" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "organiser_id" UUID,
    "order_id" UUID,
    "type" "LedgerType" NOT NULL,
    "amount_santim" INTEGER NOT NULL,
    "balance_after_santim" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "organiser_id" UUID NOT NULL,
    "amount_santim" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'requested',
    "reference" TEXT,
    "paid_at" TIMESTAMPTZ,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "check_ins" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "scanner_user_id" UUID NOT NULL,
    "gate" TEXT NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_events" (
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_events_pkey" PRIMARY KEY ("user_id","event_id")
);

-- CreateTable
CREATE TABLE "demo_payments" (
    "ref" TEXT NOT NULL,
    "gateway" "Gateway" NOT NULL,
    "amount_santim" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "refunded_santim" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_payments_pkey" PRIMARY KEY ("ref")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_gateway_ref_key" ON "orders"("gateway_ref");

-- CreateIndex
CREATE INDEX "orders_status_created_at_idx" ON "orders"("status", "created_at");

-- CreateIndex
CREATE INDEX "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- CreateIndex
CREATE INDEX "tickets_event_id_idx" ON "tickets"("event_id");

-- CreateIndex
CREATE INDEX "tickets_holder_user_id_idx" ON "tickets"("holder_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_gateway_gateway_ref_type_key" ON "payment_events"("gateway", "gateway_ref", "type");

-- CreateIndex
CREATE INDEX "ledger_entries_organiser_id_created_at_idx" ON "ledger_entries"("organiser_id", "created_at");

-- CreateIndex
CREATE INDEX "check_ins_ticket_id_idx" ON "check_ins"("ticket_id");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisers" ADD CONSTRAINT "organisers_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organiser_members" ADD CONSTRAINT "organiser_members_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "organisers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organiser_members" ADD CONSTRAINT "organiser_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "organisers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_signing_keys" ADD CONSTRAINT "event_signing_keys_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_holder_user_id_fkey" FOREIGN KEY ("holder_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_transfers" ADD CONSTRAINT "ticket_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "organisers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organiser_id_fkey" FOREIGN KEY ("organiser_id") REFERENCES "organisers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LedgerEntry is append-only (CLAUDE.md rule 6): block UPDATE and DELETE at the database level.
CREATE FUNCTION ledger_entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_append_only();

-- Inventory can never go negative or oversell (PRD 5: sold + reserved <= capacity).
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_inventory_check"
  CHECK ("sold" >= 0 AND "reserved" >= 0 AND "sold" + "reserved" <= "capacity");

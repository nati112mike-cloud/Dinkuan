import { prisma, Prisma, type Gateway, type Order } from "@dinkuan/db";
import { DomainError } from "../errors";
import { orderTotals } from "../fees";
import { appUrl } from "./config";
import { randomToken } from "./crypto";
import { audit } from "./audit";
import { gatewayFor } from "./gateways";
import { appendLedger, recordAdConversion } from "./ledger";
import { enqueueOutbound } from "./outbox";
import { failCampaignPayment, markCampaignPaid } from "./promotions";
import { refundOrderInFull } from "./refunds";
import { ensureEventSigningKey } from "./signing-keys";

export const RESERVATION_MS = 10 * 60 * 1000; // F5-AC3
export const MAX_PENDING_ORDERS = 3; // F5-AC9
export const PER_PHONE_EVENT_MAX = 10; // F5-AC9

type Tx = Prisma.TransactionClient;

export interface CheckoutItem {
  ticketTypeId: string;
  qty: number;
}

interface LockedTicketType {
  id: string;
  event_id: string;
  price_santim: number;
  capacity: number;
  sold: number;
  reserved: number;
  per_order_max: number;
  sales_start: Date | null;
  sales_end: Date | null;
  visibility: string;
  access_code: string | null;
}

/** Row-locks ticket types in a stable order so concurrent checkouts cannot deadlock or oversell. */
async function lockTicketTypes(tx: Tx, ids: string[]): Promise<Map<string, LockedTicketType>> {
  const sorted = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<LockedTicketType[]>`
    SELECT id, event_id, price_santim, capacity, sold, reserved, per_order_max, sales_start, sales_end, visibility::text AS visibility, access_code
    FROM ticket_types WHERE id = ANY(${sorted}::uuid[]) ORDER BY id FOR UPDATE`;
  return new Map(rows.map((r) => [r.id, r]));
}

/** Releases the reservation an unpaid order holds. Caller must have locked the order row. */
async function releaseReservation(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  await lockTicketTypes(
    tx,
    items.map((i) => i.ticketTypeId),
  );
  for (const i of items) {
    await tx.ticketType.update({ where: { id: i.ticketTypeId }, data: { reserved: { decrement: i.qty } } });
  }
  await tx.order.update({ where: { id: orderId }, data: { holdsReservation: false } });
}

/** F5-AC3: pending orders past their 10 minutes become expired and release their tickets. */
export async function expireStaleOrders(now = new Date(), where: Prisma.OrderWhereInput = {}) {
  const stale = await prisma.order.findMany({
    where: { ...where, status: "pending", expiresAt: { lt: now } },
    select: { id: true },
  });
  for (const { id } of stale) {
    await prisma.$transaction(async (tx) => {
      const [o] = await tx.$queryRaw<{ status: string; holds_reservation: boolean }[]>`
        SELECT status, holds_reservation FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      if (!o || o.status !== "pending") return;
      if (o.holds_reservation) await releaseReservation(tx, id);
      await tx.order.update({ where: { id }, data: { status: "expired" } });
      await audit({ actorUserId: null, action: "order.expire", entity: "order", entityId: id }, tx);
    });
  }
  return stale.length;
}

/**
 * F5: start checkout. Reserves inventory for 10 minutes inside one transaction with row locks
 * (CLAUDE.md rule 5), creates a pending order and asks the gateway for a checkout URL.
 */
export async function startCheckout(input: {
  userId: string;
  eventId: string;
  items: CheckoutItem[];
  gateway: Gateway;
  /** F21-AC7: the promotion the buyer clicked (from the ad-click cookie), for attribution. */
  campaignId?: string | null;
  /** F3-AC3: the code that unlocks hidden ticket types. */
  accessCode?: string | null;
  now?: Date;
}): Promise<{ order: Order; checkoutUrl: string | null }> {
  const now = input.now ?? new Date();
  // The same ticket type twice in one request counts as one line (per-line limits apply to the sum).
  const merged = new Map<string, number>();
  for (const i of input.items) if (i.qty > 0) merged.set(i.ticketTypeId, (merged.get(i.ticketTypeId) ?? 0) + i.qty);
  const items = [...merged].map(([ticketTypeId, qty]) => ({ ticketTypeId, qty }));
  if (items.length === 0) throw new DomainError("VALIDATION", "No tickets selected");
  // Release lapsed holds on this event too, so stock frees up even when the reconcile job runs rarely.
  await expireStaleOrders(now, { OR: [{ userId: input.userId }, { eventId: input.eventId }] });

  const order = await prisma.$transaction(async (tx) => {
    // Serialise checkouts per user so the pending-order and per-phone limits hold under races.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`;

    const event = await tx.event.findUnique({ where: { id: input.eventId } });
    // Door sales stay open until the event ends (ticket types can close earlier with sales_end).
    if (!event || event.status !== "published" || (event.endsAt ?? event.startsAt) < now) {
      throw new DomainError("EVENT_NOT_ON_SALE");
    }

    const pending = await tx.order.count({ where: { userId: input.userId, status: "pending" } });
    if (pending >= MAX_PENDING_ORDERS) throw new DomainError("TOO_MANY_PENDING_ORDERS");

    const requested = items.reduce((a, i) => a + i.qty, 0);
    const held = await tx.ticket.count({
      where: { eventId: event.id, holderUserId: input.userId, status: { in: ["valid", "checked_in"] } },
    });
    const pendingQty = await tx.orderItem.aggregate({
      _sum: { qty: true },
      where: { order: { userId: input.userId, eventId: event.id, status: "pending" } },
    });
    if (held + (pendingQty._sum.qty ?? 0) + requested > PER_PHONE_EVENT_MAX) throw new DomainError("PER_PHONE_MAX");

    const types = await lockTicketTypes(
      tx,
      items.map((i) => i.ticketTypeId),
    );
    const lines = items.map((i) => {
      const t = types.get(i.ticketTypeId);
      if (!t || t.event_id !== event.id) throw new DomainError("NOT_FOUND", "Ticket type not found");
      if (t.visibility === "hidden" && !codeMatches(t.access_code, input.accessCode)) {
        throw new DomainError("NOT_FOUND", "Ticket type not found");
      }
      if ((t.sales_start && t.sales_start > now) || (t.sales_end && t.sales_end < now)) {
        throw new DomainError("SALES_CLOSED");
      }
      if (i.qty > t.per_order_max) throw new DomainError("PER_ORDER_MAX");
      if (t.sold + t.reserved + i.qty > t.capacity) throw new DomainError("SOLD_OUT");
      return { ticketTypeId: t.id, qty: i.qty, unitPrice: t.price_santim };
    });
    for (const l of lines) {
      await tx.ticketType.update({ where: { id: l.ticketTypeId }, data: { reserved: { increment: l.qty } } });
    }
    const totals = orderTotals(lines, { feePctBps: event.feePctBps, feeFixedSantim: event.feeFixedSantim });
    return tx.order.create({
      data: {
        userId: input.userId,
        eventId: event.id,
        gateway: input.gateway,
        gatewayRef: `dk_${randomToken(12)}`,
        subtotalSantim: totals.subtotal,
        feeSantim: totals.fee,
        totalSantim: totals.total,
        expiresAt: new Date(now.getTime() + RESERVATION_MS),
        campaignId: await liveCampaignId(tx, input.campaignId),
        items: {
          create: lines.map((l) => ({ ticketTypeId: l.ticketTypeId, qty: l.qty, unitPriceSantim: l.unitPrice })),
        },
      },
    });
  });

  // Free orders need no payment.
  if (order.totalSantim === 0) {
    await markOrderPaid(order.id, { source: "free" });
    return { order, checkoutUrl: null };
  }
  const { checkoutUrl } = await gatewayFor(order.gateway).createPayment({
    ref: order.gatewayRef,
    amountSantim: order.totalSantim,
    description: `Dinkuan order #${order.number}`,
    returnUrl: `${appUrl()}/orders/${order.id}`,
    notifyUrl: `${appUrl()}/api/webhooks/${order.gateway}`,
  });
  return { order, checkoutUrl };
}


export type MarkPaidResult = "paid" | "already_paid" | "refunded_sold_out" | "refunded_cancelled" | "ignored";

/**
 * Marks an order paid and issues tickets. Only call this after a verified webhook, a
 * server-side verify call, or for a free order (CLAUDE.md rule 2). Idempotent.
 */
export async function markOrderPaid(
  orderId: string,
  ctx: { source: "webhook" | "verify" | "free" },
  now = new Date(),
): Promise<MarkPaidResult> {
  const result = await prisma.$transaction(async (tx): Promise<MarkPaidResult> => {
    const [o] = await tx.$queryRaw<{ status: string; holds_reservation: boolean }[]>`
      SELECT status, holds_reservation FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!o) return "ignored";
    if (o.status === "paid") return "already_paid";
    if (o.status !== "pending" && o.status !== "expired" && o.status !== "failed") return "ignored";

    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, user: true, event: true },
    });
    // Money that arrives for a cancelled event goes straight back; no tickets, no sale booked.
    if (order.event.status === "cancelled") {
      if (o.holds_reservation) await releaseReservation(tx, orderId);
      await tx.order.update({ where: { id: orderId }, data: { status: "refund_pending", paidAt: now } });
      await audit({ actorUserId: null, action: "order.paid_after_cancel", entity: "order", entityId: orderId, after: { source: ctx.source } }, tx);
      return "refunded_cancelled";
    }
    const types = await lockTicketTypes(
      tx,
      order.items.map((i) => i.ticketTypeId),
    );

    if (!o.holds_reservation) {
      // F5 edge case: paid after the reservation expired. Issue if stock remains, else refund.
      const fits = order.items.every((i) => {
        const t = types.get(i.ticketTypeId)!;
        return t.sold + t.reserved + i.qty <= t.capacity;
      });
      if (!fits) {
        await tx.order.update({ where: { id: orderId }, data: { status: "refund_pending", paidAt: now } });
        await audit({ actorUserId: null, action: "order.paid_sold_out", entity: "order", entityId: orderId, after: { source: ctx.source } }, tx);
        return "refunded_sold_out";
      }
    }
    for (const i of order.items) {
      await tx.ticketType.update({
        where: { id: i.ticketTypeId },
        data: {
          sold: { increment: i.qty },
          ...(o.holds_reservation ? { reserved: { decrement: i.qty } } : {}),
        },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: "paid", paidAt: now, holdsReservation: false },
    });
    await audit({ actorUserId: null, action: "order.paid", entity: "order", entityId: orderId, after: { source: ctx.source, total: order.totalSantim } }, tx);
    await ensureEventSigningKey(order.eventId, tx);
    const holderName = order.user.name ?? "Guest";
    for (const i of order.items) {
      await tx.ticket.createMany({
        data: Array.from({ length: i.qty }, () => ({
          orderId,
          ticketTypeId: i.ticketTypeId,
          eventId: order.eventId,
          holderUserId: order.userId,
          holderName,
        })),
      });
    }
    if (order.subtotalSantim > 0) {
      await appendLedger(tx, {
        organiserId: order.event.organiserId,
        orderId,
        type: "sale",
        amount: order.subtotalSantim,
        ref: order.gatewayRef,
      });
    }
    if (order.feeSantim > 0) {
      // The platform fee is never mixed into organiser revenue (F11-AC3).
      await appendLedger(tx, { organiserId: null, orderId, type: "fee", amount: order.feeSantim, ref: order.gatewayRef });
    }
    if (order.campaignId) await recordAdConversion(tx, order.campaignId, "ticket_sale", orderId);
    // F7-AC3: queue ticket delivery to Telegram in the same transaction (one per order).
    await enqueueOutbound(tx, {
      userId: order.userId,
      kind: "tickets_paid",
      payload: { orderId },
      dedupeKey: `tickets:${orderId}`,
    });
    return "paid";
  });

  if (result === "refunded_sold_out") await refundOrderInFull(orderId, "SOLD_OUT_AFTER_EXPIRY", null);
  if (result === "refunded_cancelled") await refundOrderInFull(orderId, "EVENT_CANCELLED", null);
  return result;
}

/** How long an unfinished webhook is left to its first request before a retry takes it over. */
export const WEBHOOK_RECLAIM_S = 60;

/**
 * F5-AC6/AC7: handle a gateway webhook. The signature is checked by the gateway adapter,
 * the event goes into the PaymentEvent inbox first (unique constraint = idempotency), and
 * success is double-checked with a server-side verify before tickets are issued.
 */
export async function handlePaymentWebhook(
  gateway: Gateway,
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<{ status: "processed" | "duplicate" | "ignored"; result?: MarkPaidResult }> {
  const adapter = gatewayFor(gateway);
  const parsed = await adapter.parseWebhook(rawBody, headers); // throws on bad signature
  try {
    await prisma.paymentEvent.create({
      data: {
        gateway,
        gatewayRef: parsed.ref,
        type: parsed.type,
        rawPayload: parsed.raw as Prisma.InputJsonValue,
        signatureOk: true,
      },
    });
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    // A retry of an event we stored but never finished processing is taken over and processed
    // again (every step is idempotent). One that is processed, or still being processed by
    // another request right now, is a duplicate.
    const reclaimed = await prisma.$executeRaw`
      UPDATE payment_events SET received_at = now()
      WHERE gateway = ${gateway}::"Gateway" AND gateway_ref = ${parsed.ref} AND type = ${parsed.type}
        AND processed = false AND received_at < now() - make_interval(secs => ${WEBHOOK_RECLAIM_S})`;
    if (reclaimed === 0) return { status: "duplicate" };
  }
  const order = await prisma.order.findUnique({ where: { gatewayRef: parsed.ref } });
  const campaign = order ? null : await prisma.campaign.findUnique({ where: { gatewayRef: parsed.ref } });
  let result: MarkPaidResult | undefined;
  if (campaign) {
    if (parsed.status === "paid") {
      const check = await adapter.verify(parsed.ref);
      if (check.status === "paid" && check.amountSantim === campaign.budgetSantim) {
        await markCampaignPaid(campaign.id, { source: "webhook" });
      }
    } else if (parsed.status === "failed") {
      await failCampaignPayment(campaign.id);
    }
  }
  if (order) {
    if (parsed.status === "paid") {
      const check = await adapter.verify(parsed.ref);
      if (check.status === "paid" && check.amountSantim === order.totalSantim) {
        result = await markOrderPaid(order.id, { source: "webhook" });
      }
    } else if (parsed.status === "failed") {
      await failOrder(order.id);
    }
  }
  await prisma.paymentEvent.update({
    where: { gateway_gatewayRef_type: { gateway, gatewayRef: parsed.ref, type: parsed.type } },
    data: { processed: true },
  });
  return { status: order || campaign ? "processed" : "ignored", result };
}

async function failOrder(orderId: string) {
  await prisma.$transaction(async (tx) => {
    const [o] = await tx.$queryRaw<{ status: string; holds_reservation: boolean }[]>`
      SELECT status, holds_reservation FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
    if (!o || o.status !== "pending") return;
    if (o.holds_reservation) await releaseReservation(tx, orderId);
    await tx.order.update({ where: { id: orderId }, data: { status: "failed" } });
    await audit({ actorUserId: null, action: "order.fail", entity: "order", entityId: orderId }, tx);
  });
}

/** Server-side verify for one order (used by the order page and reconciliation). */
export async function verifyOrderWithGateway(orderId: string): Promise<Order> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status === "pending" || order.status === "expired" || order.status === "failed") {
    const check = await gatewayFor(order.gateway).verify(order.gatewayRef);
    if (check.status === "paid" && check.amountSantim === order.totalSantim) {
      await markOrderPaid(order.id, { source: "verify" });
    }
  }
  return prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

/** How far back reconciliation looks for expired or failed orders the gateway may still have charged. */
export const RECONCILE_LOOKBACK_MS = 48 * 3600 * 1000;

/**
 * F5-AC8: every 10 minutes, verify pending orders older than 5 minutes, then expire stale ones.
 * Orders that expired or failed in the last 48 hours are checked too, so a buyer who was charged
 * after a lost webhook still gets their tickets (or a refund if it sold out).
 */
export async function reconcilePendingOrders(now = new Date()) {
  const cutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const pending = await prisma.order.findMany({
    where: {
      totalSantim: { gt: 0 },
      OR: [
        { status: "pending", createdAt: { lt: cutoff } },
        { status: { in: ["expired", "failed"] }, createdAt: { gt: new Date(now.getTime() - RECONCILE_LOOKBACK_MS) } },
      ],
    },
    select: { id: true },
  });
  for (const { id } of pending) await verifyOrderWithGateway(id).catch(() => undefined);
  const expired = await expireStaleOrders(now);
  return { checked: pending.length, expired };
}

/** Hidden ticket codes are matched without regard to case or surrounding spaces. */
export function codeMatches(expected: string | null, given: string | null | undefined) {
  return !!expected && !!given && expected.trim().toLowerCase() === given.trim().toLowerCase();
}

/** Only a campaign that exists and has been live can be credited with a sale. */
async function liveCampaignId(tx: Tx, id: string | null | undefined): Promise<string | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const c = await tx.campaign.findUnique({ where: { id }, select: { id: true, startsAt: true } });
  return c?.startsAt ? c.id : null;
}

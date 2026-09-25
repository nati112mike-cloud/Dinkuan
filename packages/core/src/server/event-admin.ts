import { prisma, type Prisma, type Venue } from "@dinkuan/db";
import { z } from "zod";
import { DomainError } from "../errors";
import { audit } from "./audit";
import { randomToken } from "./crypto";
import { gatewayFor } from "./gateways";
import { appendLedger } from "./ledger";
import { assertCanManage, canSellPaid, notifyUser } from "./organisers";

/** F3-AC5: a new organiser's first 3 events go through admin review. */
export const REVIEWED_EVENTS = 3;

export const EVENT_CATEGORIES = [
  "nightlife",
  "concert",
  "festival",
  "comedy",
  "arts_culture",
  "conference",
  "sports",
  "community",
  "holiday",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => v || null);

export const eventInput = z
  .object({
    titleAm: optionalText(120),
    titleEn: optionalText(120),
    descAm: optionalText(4000),
    descEn: optionalText(4000),
    category: z.enum(EVENT_CATEGORIES),
    venueId: z.uuid().optional().nullable(),
    venue: z
      .object({
        name: z.string().trim().min(2).max(120),
        address: z.string().trim().min(2).max(200),
        lat: z.number().min(8.7).max(9.2),
        lng: z.number().min(38.5).max(39.0),
      })
      .optional()
      .nullable(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }).optional().nullable(),
    /** An uploaded poster, or null for the generated design (/posters/<slug>). */
    posterUrl: z.string().max(300).optional().nullable(),
    lineup: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  })
  .superRefine((v, ctx) => {
    // F3-AC1: a title in at least one language, and a venue (existing or new with a map pin).
    if (!v.titleAm && !v.titleEn) ctx.addIssue({ code: "custom", path: ["titleEn"], message: "Add a title" });
    if (!v.venueId && !v.venue) ctx.addIssue({ code: "custom", path: ["venue"], message: "Add a venue" });
    if (v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Ends before it starts" });
    }
  });
export type EventInput = z.input<typeof eventInput>;

function slugBase(title: string) {
  const ascii = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return ascii || "event";
}

async function uniqueSlug(title: string) {
  const base = slugBase(title);
  for (let i = 0; i < 5; i++) {
    const slug = i === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    if (!(await prisma.event.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function resolveVenue(tx: Prisma.TransactionClient, input: z.infer<typeof eventInput>): Promise<Venue> {
  if (input.venueId) {
    const v = await tx.venue.findUnique({ where: { id: input.venueId } });
    if (!v) throw new DomainError("NOT_FOUND", "Venue not found");
    return v;
  }
  return tx.venue.create({ data: input.venue! });
}

function eventData(input: z.infer<typeof eventInput>) {
  return {
    titleAm: input.titleAm,
    titleEn: input.titleEn,
    descAm: input.descAm,
    descEn: input.descEn,
    category: input.category,
    startsAt: new Date(input.startsAt),
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    lineup: input.lineup,
  };
}

/** F3 story: create an event as a draft (details step of the wizard). */
export async function createEvent(actorId: string, organiserId: string, raw: EventInput) {
  await assertCanManage(actorId, organiserId);
  const input = eventInput.parse(raw);
  const slug = await uniqueSlug(input.titleEn ?? input.titleAm ?? "event");
  return prisma.$transaction(async (tx) => {
    const venue = await resolveVenue(tx, input);
    const event = await tx.event.create({
      data: { ...eventData(input), organiserId, slug, venueId: venue.id, posterUrl: input.posterUrl || `/posters/${slug}`, status: "draft" },
    });
    await audit({ actorUserId: actorId, action: "event.create", entity: "event", entityId: event.id, after: { slug } }, tx);
    return event;
  });
}

async function managedEvent(actorId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { organiser: true, ticketTypes: { orderBy: { sortOrder: "asc" } } } });
  if (!event) throw new DomainError("NOT_FOUND");
  const access = await assertCanManage(actorId, event.organiserId);
  return { event, access };
}

/** Edit details. Ended and cancelled events are read-only. */
export async function updateEvent(actorId: string, eventId: string, raw: EventInput) {
  const { event } = await managedEvent(actorId, eventId);
  if (event.status === "ended" || event.status === "cancelled") throw new DomainError("EVENT_STATE");
  const input = eventInput.parse(raw);
  return prisma.$transaction(async (tx) => {
    const venue = await resolveVenue(tx, input);
    const updated = await tx.event.update({
      where: { id: eventId },
      data: { ...eventData(input), venueId: venue.id, posterUrl: input.posterUrl || `/posters/${event.slug}` },
    });
    await audit({ actorUserId: actorId, action: "event.update", entity: "event", entityId: eventId, before: { startsAt: event.startsAt }, after: { startsAt: updated.startsAt } }, tx);
    return updated;
  });
}

const santim = z.number().int().min(0).max(100_000_000);

export const ticketTypeInput = z
  .object({
    id: z.uuid().optional().nullable(),
    name: z.string().trim().min(1).max(40),
    priceSantim: santim,
    capacity: z.number().int().min(1).max(100_000),
    salesStart: z.iso.datetime({ offset: true }).optional().nullable(),
    salesEnd: z.iso.datetime({ offset: true }).optional().nullable(),
    perOrderMax: z.number().int().min(1).max(20).default(10),
    visibility: z.enum(["public", "hidden"]).default("public"),
    accessCode: z.string().trim().min(3).max(20).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.visibility === "hidden" && !v.accessCode) ctx.addIssue({ code: "custom", path: ["accessCode"], message: "Hidden tickets need a code" });
    if (v.priceSantim > 0 && v.priceSantim < 100) ctx.addIssue({ code: "custom", path: ["priceSantim"], message: "Minimum 1 Br" });
    if (v.salesStart && v.salesEnd && new Date(v.salesEnd) <= new Date(v.salesStart)) {
      ctx.addIssue({ code: "custom", path: ["salesEnd"], message: "Sales end before they start" });
    }
  });
export type TicketTypeInput = z.input<typeof ticketTypeInput>;

/**
 * F3-AC3/AC4/AC6: save the tickets step. Types can be added, edited and reordered. A type that
 * has sold can't change price (add a new type instead), can't be removed, and can't drop below
 * what is already sold or held. Changes run under row locks so a checkout can't race them.
 */
export async function saveTicketTypes(actorId: string, eventId: string, raw: TicketTypeInput[]) {
  const { event } = await managedEvent(actorId, eventId);
  if (event.status === "ended" || event.status === "cancelled") throw new DomainError("EVENT_STATE");
  const input = z.array(ticketTypeInput).min(1).max(10).parse(raw);
  if (input.some((t) => t.priceSantim > 0) && !canSellPaid(event.organiser)) throw new DomainError("ORGANISER_NOT_APPROVED");
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; price_santim: number; sold: number; reserved: number }[]>`
      SELECT id, price_santim, sold, reserved FROM ticket_types WHERE event_id = ${eventId}::uuid ORDER BY id FOR UPDATE`;
    const current = new Map(rows.map((r) => [r.id, r]));
    const kept = new Set(input.map((t) => t.id).filter(Boolean));
    for (const r of rows) {
      if (kept.has(r.id)) continue;
      if (r.sold + r.reserved > 0) throw new DomainError("TYPE_HAS_SALES");
      await tx.ticketType.delete({ where: { id: r.id } });
    }
    for (const [i, t] of input.entries()) {
      const data = {
        name: t.name,
        priceSantim: t.priceSantim,
        capacity: t.capacity,
        salesStart: t.salesStart ? new Date(t.salesStart) : null,
        salesEnd: t.salesEnd ? new Date(t.salesEnd) : null,
        perOrderMax: t.perOrderMax,
        visibility: t.visibility,
        accessCode: t.visibility === "hidden" ? t.accessCode! : null,
        sortOrder: i,
      };
      const prev = t.id ? current.get(t.id) : undefined;
      if (t.id && !prev) throw new DomainError("NOT_FOUND", "Ticket type not found");
      if (prev) {
        if (prev.sold > 0 && prev.price_santim !== t.priceSantim) throw new DomainError("PRICE_LOCKED");
        if (t.capacity < prev.sold + prev.reserved) throw new DomainError("CAPACITY_BELOW_SOLD");
        await tx.ticketType.update({ where: { id: prev.id }, data });
      } else {
        await tx.ticketType.create({ data: { ...data, eventId } });
      }
    }
    await audit({ actorUserId: actorId, action: "event.tickets", entity: "event", entityId: eventId, after: { types: input.length } }, tx);
    return tx.ticketType.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
  });
}

/** What's missing before an event can go live (F3-AC1), as stable keys for the UI. */
export function missingForPublish(e: {
  titleAm: string | null;
  titleEn: string | null;
  posterUrl: string;
  startsAt: Date;
  ticketTypes: unknown[];
}, now = new Date()) {
  const missing: ("title" | "poster" | "tickets" | "past")[] = [];
  if (!e.titleAm && !e.titleEn) missing.push("title");
  if (!e.posterUrl) missing.push("poster");
  if (e.ticketTypes.length === 0) missing.push("tickets");
  if (e.startsAt <= now) missing.push("past");
  return missing;
}

/**
 * F3-AC5: publish from the review step. A new organiser's first 3 events wait for admin review;
 * after that they go live straight away. Paid tickets need an approved business (F2-AC1/AC2).
 */
export async function submitEvent(actorId: string, eventId: string, now = new Date()) {
  const { event } = await managedEvent(actorId, eventId);
  if (event.status !== "draft") throw new DomainError("EVENT_STATE");
  if (missingForPublish(event, now).length) throw new DomainError("EVENT_INCOMPLETE");
  if (event.ticketTypes.some((t) => t.priceSantim > 0) && !canSellPaid(event.organiser)) {
    throw new DomainError("ORGANISER_NOT_APPROVED");
  }
  const liveBefore = await prisma.event.count({
    where: { organiserId: event.organiserId, status: { in: ["published", "ended"] }, id: { not: eventId } },
  });
  const status = liveBefore < REVIEWED_EVENTS && !event.organiser.trusted ? "pending_review" : "published";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: { status, reviewNote: null } });
    await audit({ actorUserId: actorId, action: "event.submit", entity: "event", entityId: eventId, before: { status: event.status }, after: { status } }, tx);
    return updated;
  });
}

/** F3-AC5 / F12-AC1: an admin publishes an event in review, or sends it back to draft with a note. */
export async function reviewEvent(adminId: string, eventId: string, approve: boolean, note?: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { organiser: true } });
  if (!event) throw new DomainError("NOT_FOUND");
  if (event.status !== "pending_review") throw new DomainError("EVENT_STATE");
  const reviewNote = approve ? null : note?.trim().slice(0, 300) || "Please check the details and try again";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id: eventId }, data: { status: approve ? "published" : "draft", reviewNote } });
    await audit(
      { actorUserId: adminId, action: approve ? "event.approve" : "event.reject", entity: "event", entityId: eventId, before: { status: event.status }, after: { status: updated.status, note: reviewNote } },
      tx,
    );
    await notifyUser(tx, {
      recipientId: event.organiser.ownerUserId,
      actorId: adminId,
      type: approve ? "event_approved" : "event_rejected",
      href: `/organiser/events/${eventId}`,
    });
    return updated;
  });
}

/**
 * F3-AC7 / F9: cancelling a published event refunds every paid order in full through the gateway
 * (ticket price and fee), voids the tickets and books the refunds in the ledger. A refund the
 * gateway refuses leaves the order in refund_pending for an admin (F12-AC1).
 */
export async function cancelEvent(actorId: string, eventId: string, reason: string) {
  const { event } = await managedEvent(actorId, eventId);
  if (event.status === "cancelled" || event.status === "ended") throw new DomainError("EVENT_STATE");
  const why = z.string().trim().min(3).max(300).parse(reason);
  await prisma.$transaction(async (tx) => {
    await tx.event.update({ where: { id: eventId }, data: { status: "cancelled" } });
    await audit({ actorUserId: actorId, action: "event.cancel", entity: "event", entityId: eventId, before: { status: event.status }, after: { reason: why } }, tx);
  });
  const orders = await prisma.order.findMany({ where: { eventId, status: "paid" } });
  let refunded = 0;
  let failed = 0;
  for (const order of orders) {
    const ok = await refundOrderInFull(order.id, `Event cancelled: ${why}`, actorId);
    if (ok) refunded += 1;
    else failed += 1;
  }
  return { orders: orders.length, refunded, failed };
}

/** Refunds one paid order in full. Returns false (and leaves refund_pending) if the gateway fails. */
export async function refundOrderInFull(orderId: string, reason: string, actorId: string | null) {
  const claimed = await prisma.order.updateMany({ where: { id: orderId, status: { in: ["paid", "refund_pending"] } }, data: { status: "refund_pending" } });
  if (claimed.count === 0) return false;
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { event: true } });
  if (order.totalSantim === 0) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: "refunded" } });
      await tx.ticket.updateMany({ where: { orderId }, data: { status: "void" } });
    });
    return true;
  }
  const res = await gatewayFor(order.gateway)
    .refund(order.gatewayRef, order.totalSantim, reason)
    .catch(() => ({ ok: false, refundRef: undefined }));
  await prisma.$transaction(async (tx) => {
    await tx.refund.create({
      data: { orderId, amountSantim: order.totalSantim, reason, status: res.ok ? "done" : "failed", gatewayRef: res.refundRef ?? null, createdBy: actorId },
    });
    if (!res.ok) {
      await audit({ actorUserId: actorId, action: "order.refund_failed", entity: "order", entityId: orderId, after: { reason } }, tx);
      return;
    }
    await tx.order.update({ where: { id: orderId }, data: { status: "refunded" } });
    await tx.ticket.updateMany({ where: { orderId }, data: { status: "refunded" } });
    const ref = res.refundRef ?? order.gatewayRef;
    if (order.subtotalSantim > 0) {
      await appendLedger(tx, { organiserId: order.event.organiserId, orderId, type: "refund", amount: -order.subtotalSantim, ref });
    }
    if (order.feeSantim > 0) {
      await appendLedger(tx, { organiserId: null, orderId, type: "refund", amount: -order.feeSantim, ref });
    }
    await audit({ actorUserId: actorId, action: "order.refund", entity: "order", entityId: orderId, after: { amount: order.totalSantim, reason, refundRef: res.refundRef } }, tx);
  });
  return res.ok;
}

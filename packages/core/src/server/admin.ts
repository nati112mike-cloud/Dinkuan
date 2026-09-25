import { prisma } from "@dinkuan/db";
import { z } from "zod";
import { DomainError } from "../errors";
import { audit } from "./audit";

/** F12-AC3 thresholds. */
export const FRAUD = {
  ticketsPerPhonePerEvent: 20,
  failedPaymentsPerDay: 5,
  duplicateScansPerHour: 10,
} as const;

export type FraudFlag =
  | { kind: "tickets_per_phone"; userId: string; phone: string; eventId: string; eventSlug: string; count: number }
  | { kind: "failed_payments"; userId: string; phone: string; count: number }
  | { kind: "duplicate_scans"; eventId: string; eventSlug: string; hour: Date; count: number };

/**
 * F12-AC3: fraud flags, computed from orders and check-ins: more than 20 tickets per phone per
 * event, many failed payments from one account in a day, and bursts of duplicate scans at a gate.
 */
export async function fraudFlags(now = new Date()): Promise<FraudFlag[]> {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [bulk, failed, dupes] = await Promise.all([
    prisma.$queryRaw<{ user_id: string; phone: string; event_id: string; slug: string; n: bigint }[]>`
      SELECT o.user_id, u.phone, o.event_id, e.slug, sum(i.qty)::bigint AS n
      FROM orders o JOIN order_items i ON i.order_id = o.id JOIN users u ON u.id = o.user_id JOIN events e ON e.id = o.event_id
      WHERE o.status = 'paid'
      GROUP BY o.user_id, u.phone, o.event_id, e.slug
      HAVING sum(i.qty) > ${FRAUD.ticketsPerPhonePerEvent}
      ORDER BY n DESC LIMIT 50`,
    prisma.$queryRaw<{ user_id: string; phone: string; n: bigint }[]>`
      SELECT o.user_id, u.phone, count(*)::bigint AS n
      FROM orders o JOIN users u ON u.id = o.user_id
      WHERE o.status = 'failed' AND o.created_at > ${dayAgo}
      GROUP BY o.user_id, u.phone
      HAVING count(*) >= ${FRAUD.failedPaymentsPerDay}
      ORDER BY n DESC LIMIT 50`,
    prisma.$queryRaw<{ event_id: string; slug: string; hour: Date; n: bigint }[]>`
      SELECT t.event_id, e.slug, date_trunc('hour', c.scanned_at) AS hour, count(*)::bigint AS n
      FROM check_ins c JOIN tickets t ON t.id = c.ticket_id JOIN events e ON e.id = t.event_id
      WHERE c.result = 'duplicate' AND c.scanned_at > ${new Date(now.getTime() - 7 * 86_400_000)}
      GROUP BY t.event_id, e.slug, 3
      HAVING count(*) >= ${FRAUD.duplicateScansPerHour}
      ORDER BY n DESC LIMIT 50`,
  ]);
  return [
    ...bulk.map((r) => ({ kind: "tickets_per_phone" as const, userId: r.user_id, phone: r.phone, eventId: r.event_id, eventSlug: r.slug, count: Number(r.n) })),
    ...failed.map((r) => ({ kind: "failed_payments" as const, userId: r.user_id, phone: r.phone, count: Number(r.n) })),
    ...dupes.map((r) => ({ kind: "duplicate_scans" as const, eventId: r.event_id, eventSlug: r.slug, hour: r.hour, count: Number(r.n) })),
  ];
}

/** F12-AC1: the work waiting for admins, oldest first. */
export async function adminQueues() {
  const [organisers, events, refunds] = await Promise.all([
    prisma.organiser.findMany({
      where: { status: "submitted" },
      orderBy: { submittedAt: "asc" },
      include: { owner: { select: { name: true, phone: true, profile: { select: { username: true } } } } },
    }),
    prisma.event.findMany({
      where: { status: "pending_review" },
      orderBy: { createdAt: "asc" },
      include: { organiser: true, venue: true, ticketTypes: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.order.findMany({
      where: { status: "refund_pending" },
      orderBy: { createdAt: "asc" },
      include: { event: { select: { slug: true, titleEn: true, titleAm: true } }, refunds: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
  ]);
  return { organisers, events, refunds };
}

export const feeInput = z.object({
  feePctBps: z.number().int().min(0).max(2000),
  feeFixedSantim: z.number().int().min(0).max(100_000),
});

/** F12-AC2: feature an event on Home. Audit-logged (AC4). */
export async function setFeatured(adminId: string, eventId: string, featured: boolean) {
  const e = await prisma.event.findUnique({ where: { id: eventId } });
  if (!e) throw new DomainError("NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const u = await tx.event.update({ where: { id: eventId }, data: { featured } });
    await audit({ actorUserId: adminId, action: "event.feature", entity: "event", entityId: eventId, before: { featured: e.featured }, after: { featured } }, tx);
    return u;
  });
}

/**
 * F12-AC2: per-event fee override. Only affects checkouts started afterwards; orders already
 * placed keep the fee they were quoted. Audit-logged with before and after (AC4).
 */
export async function setFeeOverride(adminId: string, eventId: string, raw: z.input<typeof feeInput>) {
  const input = feeInput.parse(raw);
  const e = await prisma.event.findUnique({ where: { id: eventId } });
  if (!e) throw new DomainError("NOT_FOUND");
  return prisma.$transaction(async (tx) => {
    const u = await tx.event.update({ where: { id: eventId }, data: input });
    await audit(
      { actorUserId: adminId, action: "event.fee_override", entity: "event", entityId: eventId, before: { feePctBps: e.feePctBps, feeFixedSantim: e.feeFixedSantim }, after: input },
      tx,
    );
    return u;
  });
}

/** F12-AC4: the audit log, newest first, optionally for one entity. */
export async function auditLog(opts: { entity?: string; entityId?: string; before?: Date; take?: number } = {}) {
  return prisma.auditLog.findMany({
    where: {
      ...(opts.entity ? { entity: opts.entity } : {}),
      ...(opts.entityId ? { entityId: opts.entityId } : {}),
      ...(opts.before ? { createdAt: { lt: opts.before } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(opts.take ?? 50, 200),
  });
}

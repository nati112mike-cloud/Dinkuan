import { prisma } from "@dinkuan/db";
import { DomainError } from "../errors";
import { assertCanManage } from "./organisers";

/** Consent a buyer gives at checkout to share their phone with this event's organiser (rule 12). */
export const phoneConsentType = (eventId: string) => `share_phone:${eventId}`;

/**
 * F11-AC1: live stats for one event: gross sales, tickets sold per type, fees, refunds, net
 * payable and check-ins. Money comes from the append-only ledger (F11-AC3/AC5), so the platform
 * fee is never mixed into organiser revenue.
 */
export async function eventStats(actorId: string, eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { ticketTypes: { orderBy: { sortOrder: "asc" } }, venue: true, organiser: true },
  });
  if (!event) throw new DomainError("NOT_FOUND");
  await assertCanManage(actorId, event.organiserId);
  const [ledger, fees, checkIns, issued, orders, byType, daily] = await Promise.all([
    prisma.ledgerEntry.groupBy({
      by: ["type"],
      where: { organiserId: event.organiserId, order: { eventId } },
      _sum: { amountSantim: true },
    }),
    prisma.ledgerEntry.aggregate({ where: { organiserId: null, order: { eventId } }, _sum: { amountSantim: true } }),
    prisma.ticket.count({ where: { eventId, status: "checked_in" } }),
    prisma.ticket.count({ where: { eventId, status: { in: ["valid", "checked_in"] } } }),
    prisma.order.count({ where: { eventId, status: "paid" } }),
    prisma.ticket.groupBy({ by: ["ticketTypeId"], where: { eventId, status: { in: ["valid", "checked_in"] } }, _count: { _all: true } }),
    prisma.$queryRaw<{ day: Date; tickets: bigint }[]>`
      SELECT date_trunc('day', o.paid_at AT TIME ZONE 'Africa/Addis_Ababa') AS day, sum(i.qty)::bigint AS tickets
      FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.event_id = ${eventId}::uuid AND o.status = 'paid'
      GROUP BY 1 ORDER BY 1`,
  ]);
  const sum = (type: string) => ledger.find((l) => l.type === type)?._sum.amountSantim ?? 0;
  const gross = sum("sale");
  const refunds = sum("refund");
  const soldByType = new Map(byType.map((r) => [r.ticketTypeId, r._count._all]));
  return {
    event,
    grossSantim: gross,
    refundsSantim: refunds === 0 ? 0 : -refunds,
    netSantim: gross + refunds,
    feesSantim: fees._sum.amountSantim ?? 0,
    orders,
    ticketsIssued: issued,
    checkIns,
    types: event.ticketTypes.map((t) => ({
      id: t.id,
      name: t.name,
      priceSantim: t.priceSantim,
      capacity: t.capacity,
      sold: soldByType.get(t.id) ?? 0,
      revenueSantim: (soldByType.get(t.id) ?? 0) * t.priceSantim,
    })),
    daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), tickets: Number(d.tickets) })),
  };
}

/**
 * F11-AC2: attendees with name, ticket type and check-in status. The phone number is included
 * only when the buyer agreed to share it with the organiser at checkout (CLAUDE.md rule 12).
 */
export async function attendees(actorId: string, eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { organiserId: true } });
  if (!event) throw new DomainError("NOT_FOUND");
  await assertCanManage(actorId, event.organiserId);
  const tickets = await prisma.ticket.findMany({
    where: { eventId, status: { in: ["valid", "checked_in"] } },
    include: { ticketType: { select: { name: true } }, holder: { select: { id: true, phone: true } } },
    orderBy: [{ holderName: "asc" }, { id: "asc" }],
  });
  const answers = await prisma.consent.findMany({
    where: { userId: { in: [...new Set(tickets.map((t) => t.holderUserId))] }, type: phoneConsentType(eventId) },
    orderBy: { createdAt: "asc" },
  });
  // The latest answer wins, so withdrawing consent hides the number again.
  const consent = answers.reduce((m, c) => m.set(c.userId, c.granted), new Map<string, boolean>());
  return tickets.map((t) => ({
    ticketId: t.id,
    name: t.holderName,
    ticketType: t.ticketType.name,
    checkedIn: t.status === "checked_in",
    checkedInAt: t.checkedInAt,
    phone: consent.get(t.holderUserId) ? t.holder.phone : null,
  }));
}

function csvCell(v: string, neutralise = true) {
  // Quote everything and neutralise spreadsheet formulas in free text (names, type names).
  const safe = neutralise && /^[=+\-@]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function attendeesCsv(rows: Awaited<ReturnType<typeof attendees>>) {
  const head = ["Name", "Ticket type", "Checked in", "Phone"];
  const lines = rows.map((r) => [csvCell(r.name), csvCell(r.ticketType), csvCell(r.checkedIn ? "yes" : "no"), csvCell(r.phone ?? "", false)].join(","));
  return [head.map((h) => csvCell(h)).join(","), ...lines].join("\r\n") + "\r\n";
}

/** F11-AC3: the organiser's running totals from the ledger: sales, refunds and net. */
export async function organiserMoney(actorId: string, organiserId: string) {
  await assertCanManage(actorId, organiserId);
  const rows = await prisma.ledgerEntry.groupBy({ by: ["type"], where: { organiserId }, _sum: { amountSantim: true } });
  const sum = (type: string) => rows.find((r) => r.type === type)?._sum.amountSantim ?? 0;
  return { salesSantim: sum("sale"), refundsSantim: Math.abs(sum("refund")), payoutsSantim: Math.abs(sum("payout")), netSantim: sum("sale") + sum("refund") + sum("payout") };
}

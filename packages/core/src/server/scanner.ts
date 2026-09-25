import { prisma, type User, type UserRole } from "@dinkuan/db";
import { DomainError } from "../errors";

type UserWithRoles = User & { roles: UserRole[] };

/** Events this user may scan: owner or team member of the organiser, or an admin (CLAUDE.md rule 7). */
export async function scannableEvents(user: UserWithRoles, now = new Date()) {
  const isAdmin = user.roles.some((r) => r.role === "admin");
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return prisma.event.findMany({
    where: {
      status: "published",
      startsAt: { gte: since },
      ...(isAdmin
        ? {}
        : {
            organiser: {
              OR: [{ ownerUserId: user.id }, { members: { some: { userId: user.id } } }],
            },
          }),
    },
    include: { venue: true },
    orderBy: { startsAt: "asc" },
  });
}

async function assertCanScan(user: UserWithRoles, eventId: string) {
  const events = await scannableEvents(user);
  if (!events.some((e) => e.id === eventId)) throw new DomainError("FORBIDDEN");
}

/** F8-AC1: offline pack = public key + ticket list. No private key, no full phone numbers. */
export async function offlinePack(user: UserWithRoles, eventId: string) {
  await assertCanScan(user, eventId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { venue: true } });
  if (!event.signingPublicKey) throw new DomainError("NOT_FOUND", "Event has no tickets yet");
  const tickets = await prisma.ticket.findMany({
    where: { eventId },
    include: { ticketType: true, holder: { select: { phone: true } } },
  });
  return {
    event: {
      id: event.id,
      title: event.titleEn ?? event.titleAm ?? "",
      titleAm: event.titleAm,
      startsAt: event.startsAt.toISOString(),
      venue: event.venue.name,
      publicKey: event.signingPublicKey,
    },
    generatedAt: new Date().toISOString(),
    tickets: tickets.map((t) => ({
      id: t.id,
      version: t.version,
      status: t.status,
      typeName: t.ticketType.name,
      holderName: t.holderName,
      phoneLast4: t.holder.phone.slice(-4),
      checkedInAt: t.checkedInAt?.toISOString() ?? null,
      gate: t.gate,
    })),
  };
}

export interface SyncCheckIn {
  ticketId: string;
  scannedAt: string;
  gate: string;
}

/**
 * F8-AC4: merge offline check-ins from many gates. First scan wins; later scans of the same
 * ticket are recorded as duplicates and flagged as conflicts when they came from another gate.
 */
export async function syncCheckIns(user: UserWithRoles, eventId: string, checkIns: SyncCheckIn[]) {
  await assertCanScan(user, eventId);
  const results: { ticketId: string; result: "admitted" | "duplicate" | "conflict" | "rejected"; firstScanAt?: string; gate?: string | null }[] = [];
  const ordered = [...checkIns].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
  for (const c of ordered) {
    const scannedAt = new Date(c.scannedAt);
    const r = await prisma.$transaction(async (tx) => {
      const [t] = await tx.$queryRaw<{ id: string; event_id: string; status: string; checked_in_at: Date | null; gate: string | null }[]>`
        SELECT id, event_id, status, checked_in_at, gate FROM tickets WHERE id = ${c.ticketId}::uuid FOR UPDATE`;
      if (!t || t.event_id !== eventId) return { ticketId: c.ticketId, result: "rejected" as const };
      if (t.status === "valid") {
        await tx.ticket.update({
          where: { id: t.id },
          data: { status: "checked_in", checkedInAt: scannedAt, checkedInBy: user.id, gate: c.gate },
        });
        await tx.checkIn.create({
          data: { ticketId: t.id, scannerUserId: user.id, gate: c.gate, scannedAt, result: "admitted" },
        });
        return { ticketId: t.id, result: "admitted" as const };
      }
      if (t.status === "checked_in" && t.checked_in_at) {
        let first = t.checked_in_at;
        let firstGate = t.gate;
        let result: "duplicate" | "conflict" = t.gate === c.gate ? "duplicate" : "conflict";
        if (scannedAt < t.checked_in_at) {
          // This gate actually scanned first while offline: it becomes the admitting scan.
          await tx.ticket.update({ where: { id: t.id }, data: { checkedInAt: scannedAt, gate: c.gate } });
          first = scannedAt;
          firstGate = c.gate;
          result = "conflict";
        }
        await tx.checkIn.create({
          data: { ticketId: t.id, scannerUserId: user.id, gate: c.gate, scannedAt, result },
        });
        return { ticketId: t.id, result, firstScanAt: first.toISOString(), gate: firstGate };
      }
      return { ticketId: t.id, result: "rejected" as const };
    });
    results.push(r);
  }
  return results;
}

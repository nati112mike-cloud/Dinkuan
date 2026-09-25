import { fromBase64Url, scanTicket, type ScanResult } from "@dinkuan/core";
import { api } from "./api";
import { db, type ScannerDb, type StoredTicket } from "./db";

export interface PackResponse {
  event: { id: string; title: string; titleAm: string | null; startsAt: string; venue: string; publicKey: string };
  generatedAt: string;
  tickets: (Omit<StoredTicket, "eventId">)[];
}

/** F8-AC1: download the offline pack and store it on the device. */
export async function downloadPack(eventId: string, store: ScannerDb = db) {
  const pack = await api<PackResponse>(`/api/scanner/events/${eventId}/pack`);
  await store.transaction("rw", store.packs, store.tickets, async () => {
    await store.packs.put({ eventId, ...pack.event, generatedAt: pack.generatedAt });
    await store.tickets.where("eventId").equals(eventId).delete();
    await store.tickets.bulkPut(pack.tickets.map((t) => ({ ...t, eventId })));
  });
  return pack.tickets.length;
}

/**
 * F8-AC2/AC3: verify a scanned code entirely on the device. A VALID result is queued as a
 * check-in immediately so the same ticket is rejected on the next scan, even offline.
 */
export async function verifyAtGate(
  payload: string,
  opts: { eventId: string; gate: string; now?: Date; store?: ScannerDb },
): Promise<ScanResult> {
  const store = opts.store ?? db;
  const now = opts.now ?? new Date();
  const pack = await store.packs.get(opts.eventId);
  if (!pack) throw new Error("No offline pack for this event");
  const tickets = new Map((await store.tickets.where("eventId").equals(opts.eventId).toArray()).map((t) => [t.id, t]));
  const local = new Map(
    (await store.checkIns.where("eventId").equals(opts.eventId).toArray()).map((c) => [c.ticketId, c.scannedAt]),
  );
  const result = await scanTicket(payload, {
    eventId: opts.eventId,
    publicKey: fromBase64Url(pack.publicKey),
    now,
    findTicket: (id) => tickets.get(id),
    localCheckIn: (id) => local.get(id),
  });
  if (result.valid) {
    await store.checkIns.add({
      eventId: opts.eventId,
      ticketId: result.ticket.id,
      scannedAt: now.toISOString(),
      gate: opts.gate,
      synced: 0,
    });
  }
  return result;
}

/** F8-AC5: manual search by name or the last 4 digits of the phone number. */
export async function searchTickets(eventId: string, q: string, store: ScannerDb = db) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  return store.tickets
    .where("eventId")
    .equals(eventId)
    .filter((t) => t.holderName.toLowerCase().includes(needle) || t.phoneLast4.includes(needle))
    .limit(20)
    .toArray();
}

/** Admit a ticket found by manual search (same rules as a scan, minus the signature). */
export async function manualAdmit(eventId: string, ticketId: string, gate: string, store: ScannerDb = db) {
  const t = await store.tickets.get(ticketId);
  if (!t || t.eventId !== eventId) return { ok: false as const, reason: "UNKNOWN_TICKET" };
  if (t.status !== "valid") return { ok: false as const, reason: t.status === "checked_in" ? "ALREADY_USED" : t.status.toUpperCase() };
  const prior = await store.checkIns.where("ticketId").equals(ticketId).first();
  if (prior) return { ok: false as const, reason: "ALREADY_USED", usedAt: prior.scannedAt };
  await store.checkIns.add({ eventId, ticketId, scannedAt: new Date().toISOString(), gate, synced: 0 });
  return { ok: true as const, ticket: t };
}

/** F8-AC6: checked in / total. */
export async function counts(eventId: string, store: ScannerDb = db) {
  const tickets = await store.tickets.where("eventId").equals(eventId).toArray();
  const admissible = tickets.filter((t) => t.status === "valid" || t.status === "checked_in");
  const local = new Set((await store.checkIns.where("eventId").equals(eventId).toArray()).map((c) => c.ticketId));
  const checkedIn = admissible.filter((t) => t.status === "checked_in" || local.has(t.id)).length;
  const pending = await store.checkIns.where("[eventId+synced]").equals([eventId, 0]).count();
  return { checkedIn, total: admissible.length, pending };
}

/**
 * F8-AC4: push queued check-ins, then refresh the pack so this gate sees other gates' scans
 * and any refunds (F9-AC4). Safe to call repeatedly; the server treats repeats as duplicates.
 */
export async function sync(eventId: string, store: ScannerDb = db) {
  const queued = await store.checkIns.where("[eventId+synced]").equals([eventId, 0]).toArray();
  let conflicts = 0;
  if (queued.length) {
    const { results } = await api<{ results: { ticketId: string; result: string }[] }>(
      `/api/scanner/events/${eventId}/sync`,
      { method: "POST", body: { checkIns: queued.map(({ ticketId, scannedAt, gate }) => ({ ticketId, scannedAt, gate })) } },
    );
    const byTicket = new Map(results.map((r) => [r.ticketId, r.result]));
    await store.transaction("rw", store.checkIns, async () => {
      for (const c of queued) await store.checkIns.update(c.id!, { synced: 1, result: byTicket.get(c.ticketId) });
    });
    conflicts = results.filter((r) => r.result === "conflict").length;
  }
  await downloadPack(eventId, store);
  return { pushed: queued.length, conflicts };
}

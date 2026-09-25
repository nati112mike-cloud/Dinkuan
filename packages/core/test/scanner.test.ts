import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { fromBase64Url, scanTicket, type PackTicket } from "../src";
import { handlePaymentWebhook, offlinePack, startCheckout, syncCheckIns, ticketQrCodes } from "../src/server";
import { gatewayMarksPaid, makeEvent, makeUser, resetDb, webhookFor } from "./helpers";

beforeEach(resetDb);

async function paidTickets(qty: number) {
  const setup = await makeEvent();
  const buyer = await makeUser("Hanna");
  const { order } = await startCheckout({
    userId: buyer.id,
    eventId: setup.event.id,
    items: [{ ticketTypeId: setup.ticketType.id, qty }],
    gateway: "telebirr",
  });
  await gatewayMarksPaid(order.gatewayRef);
  const w = webhookFor(order.gatewayRef, order.totalSantim);
  await handlePaymentWebhook("telebirr", w.body, w.headers);
  const tickets = await prisma.ticket.findMany({ where: { orderId: order.id } });
  const scanner = await makeUser("Gate staff");
  await prisma.organiserMember.create({ data: { organiserId: setup.organiser.id, userId: scanner.id, role: "scanner" } });
  const scannerUser = await prisma.user.findUniqueOrThrow({ where: { id: scanner.id }, include: { roles: true } });
  return { ...setup, tickets, scannerUser };
}

describe("F8 scanner", () => {
  it("F8-AC1: the offline pack has the public key and ticket list but no private key", async () => {
    const { event, tickets, scannerUser } = await paidTickets(2);
    const pack = await offlinePack(scannerUser, event.id);
    expect(pack.tickets).toHaveLength(2);
    expect(pack.event.publicKey).toBeTruthy();
    expect(JSON.stringify(pack)).not.toContain((await prisma.eventSigningKey.findUniqueOrThrow({ where: { eventId: event.id } })).privateKeyEncrypted);
    expect(pack.tickets.map((t) => t.id).sort()).toEqual(tickets.map((t) => t.id).sort());
  });

  it("rule 7: a stranger cannot download another organiser's pack", async () => {
    const { event } = await paidTickets(1);
    const stranger = await makeUser("Stranger");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: stranger.id }, include: { roles: true } });
    await expect(offlinePack(u, event.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("F8-AC2: tickets verify offline against the pack", async () => {
    const { event, tickets, scannerUser } = await paidTickets(1);
    const pack = await offlinePack(scannerUser, event.id);
    const qr = await ticketQrCodes(tickets[0]!);
    const res = await scanTicket(qr.rotating[0]!.payload, {
      eventId: event.id,
      publicKey: fromBase64Url(pack.event.publicKey),
      now: new Date(),
      findTicket: (id) => pack.tickets.find((t) => t.id === id) as PackTicket | undefined,
      localCheckIn: () => undefined,
    });
    expect(res).toMatchObject({ valid: true, ticket: { holderName: "Hanna" } });
  });

  it("F8-AC4: two gates scanning the same ticket offline: first scan wins, conflict flagged", async () => {
    const { event, tickets, scannerUser } = await paidTickets(1);
    const id = tickets[0]!.id;
    const t0 = Date.now();
    // Gate B syncs first, but gate A actually scanned 20 seconds earlier.
    const b = await syncCheckIns(scannerUser, event.id, [{ ticketId: id, gate: "B", scannedAt: new Date(t0).toISOString() }]);
    const a = await syncCheckIns(scannerUser, event.id, [
      { ticketId: id, gate: "A", scannedAt: new Date(t0 - 20_000).toISOString() },
    ]);
    expect(b[0]!.result).toBe("admitted");
    expect(a[0]).toMatchObject({ result: "conflict", gate: "A" });
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ status: "checked_in", gate: "A" });
    expect(await prisma.checkIn.count({ where: { ticketId: id } })).toBe(2);
  });

  it("F8-AC4: re-syncing the same gate's scan is a duplicate, not a second entry", async () => {
    const { event, tickets, scannerUser } = await paidTickets(1);
    const scan = { ticketId: tickets[0]!.id, gate: "A", scannedAt: new Date().toISOString() };
    await syncCheckIns(scannerUser, event.id, [scan]);
    const again = await syncCheckIns(scannerUser, event.id, [scan]);
    expect(again[0]!.result).toBe("duplicate");
  });
});

import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { DomainError } from "../src";
import {
  expireStaleOrders,
  handlePaymentWebhook,
  markOrderPaid,
  reconcilePendingOrders,
  startCheckout,
  verifyOrderWithGateway,
} from "../src/server";
import { gatewayMarksPaid, makeEvent, makeUser, resetDb, webhookFor } from "./helpers";

beforeEach(resetDb);

describe("F5 checkout", () => {
  it("F5-AC2/AC3: reserves inventory and computes the all-in total", async () => {
    const { event, ticketType } = await makeEvent({ price: 50000 });
    const user = await makeUser();
    const { order, checkoutUrl } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 2 }],
      gateway: "telebirr",
    });
    expect(order).toMatchObject({ status: "pending", subtotalSantim: 100000, feeSantim: 7000, totalSantim: 107000 });
    expect(order.expiresAt.getTime() - order.createdAt.getTime()).toBeGreaterThanOrEqual(9.9 * 60_000);
    expect(checkoutUrl).toContain("/demo-pay/");
    const tt = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(tt).toMatchObject({ reserved: 2, sold: 0 });
  });

  it("F5-AC3: unpaid reservations are released after 10 minutes", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 3 }],
      gateway: "telebirr",
    });
    await expireStaleOrders(new Date(Date.now() + 11 * 60_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("expired");
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } })).reserved).toBe(0);
  });

  it("F5-AC6: the client redirect alone does not mark the order paid", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 1 }],
      gateway: "telebirr",
    });
    // Landing on the return URL triggers a server-side verify; the gateway still says pending.
    const after = await verifyOrderWithGateway(order.id);
    expect(after.status).toBe("pending");
    expect(await prisma.ticket.count()).toBe(0);
  });

  it("F5-AC6: a verified webhook marks the order paid and issues tickets", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 2 }],
      gateway: "chapa",
    });
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    const res = await handlePaymentWebhook("chapa", w.body, w.headers);
    expect(res).toEqual({ status: "processed", result: "paid" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
    expect(await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } })).toMatchObject({
      sold: 2,
      reserved: 0,
    });
  });

  it("F5-AC6: a forged webhook is rejected", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 1 }],
      gateway: "telebirr",
    });
    const body = JSON.stringify({ ref: order.gatewayRef, event: "payment.succeeded", amount_santim: order.totalSantim });
    await expect(handlePaymentWebhook("telebirr", body, { "x-demo-signature": "deadbeef" })).rejects.toThrow();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("pending");
  });

  it("F5-AC6: a signed webhook the gateway cannot confirm does not mark the order paid", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 1 }],
      gateway: "telebirr",
    });
    const w = webhookFor(order.gatewayRef, order.totalSantim); // gateway-side status still pending
    await handlePaymentWebhook("telebirr", w.body, w.headers);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("pending");
  });

  it("F5-AC7: the same webhook twice creates no duplicate tickets", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 3 }],
      gateway: "telebirr",
    });
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    const [a, b] = await Promise.all([
      handlePaymentWebhook("telebirr", w.body, w.headers),
      handlePaymentWebhook("telebirr", w.body, w.headers),
    ]);
    expect([a.status, b.status].sort()).toEqual(["duplicate", "processed"]);
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(3);
    // A direct second markPaid is also a no-op.
    expect(await markOrderPaid(order.id, { source: "verify" })).toBe("already_paid");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(3);
  });

  it("F5-AC8: reconciliation fixes an order whose webhook never arrived", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 1 }],
      gateway: "telebirr",
    });
    await gatewayMarksPaid(order.gatewayRef);
    const res = await reconcilePendingOrders(new Date(Date.now() + 6 * 60_000));
    expect(res.checked).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
  });

  it("F5-AC9: max 3 pending orders per user", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    const start = () =>
      startCheckout({ userId: user.id, eventId: event.id, items: [{ ticketTypeId: ticketType.id, qty: 1 }], gateway: "telebirr" });
    await start();
    await start();
    await start();
    await expect(start()).rejects.toMatchObject({ code: "TOO_MANY_PENDING_ORDERS" });
  });

  it("F5-AC9: max 10 tickets per phone number per event", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    await startCheckout({ userId: user.id, eventId: event.id, items: [{ ticketTypeId: ticketType.id, qty: 8 }], gateway: "telebirr" });
    await expect(
      startCheckout({ userId: user.id, eventId: event.id, items: [{ ticketTypeId: ticketType.id, qty: 3 }], gateway: "telebirr" }),
    ).rejects.toMatchObject({ code: "PER_PHONE_MAX" });
  });

  it("F5 edge case: paid after expiry with stock left still issues tickets", async () => {
    const { event, ticketType } = await makeEvent({ capacity: 5 });
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 2 }],
      gateway: "telebirr",
    });
    await expireStaleOrders(new Date(Date.now() + 11 * 60_000));
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    expect((await handlePaymentWebhook("telebirr", w.body, w.headers)).result).toBe("paid");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("F5 edge case: paid after expiry when sold out is refunded automatically", async () => {
    const { event, ticketType } = await makeEvent({ capacity: 2 });
    const late = await makeUser("Late");
    const other = await makeUser("Other");
    const { order } = await startCheckout({
      userId: late.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 2 }],
      gateway: "telebirr",
    });
    await expireStaleOrders(new Date(Date.now() + 11 * 60_000));
    const { order: o2 } = await startCheckout({
      userId: other.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 2 }],
      gateway: "telebirr",
    });
    await gatewayMarksPaid(o2.gatewayRef);
    const w2 = webhookFor(o2.gatewayRef, o2.totalSantim);
    await handlePaymentWebhook("telebirr", w2.body, w2.headers);

    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    expect((await handlePaymentWebhook("telebirr", w.body, w.headers)).result).toBe("refunded_sold_out");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("refunded");
    expect(await prisma.refund.count({ where: { orderId: order.id, status: "done" } })).toBe(1);
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("F5-AC3 race: 50 buyers racing for the last 10 tickets never oversell", async () => {
    const { event, ticketType } = await makeEvent({ capacity: 10 });
    const buyers = await Promise.all(Array.from({ length: 50 }, (_, i) => makeUser(`Buyer ${i}`)));
    const results = await Promise.allSettled(
      buyers.map((b) =>
        startCheckout({ userId: b.id, eventId: event.id, items: [{ ticketTypeId: ticketType.id, qty: 1 }], gateway: "telebirr" }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const soldOut = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof DomainError && r.reason.code === "SOLD_OUT",
    );
    expect(ok).toHaveLength(10);
    expect(soldOut).toHaveLength(40);
    const tt = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketType.id } });
    expect(tt.reserved).toBe(10);
  });

  it("ledger: sale goes to the organiser, fee to the platform, and entries cannot be edited", async () => {
    const { event, ticketType, organiser } = await makeEvent({ price: 50000 });
    const user = await makeUser();
    const { order } = await startCheckout({
      userId: user.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 2 }],
      gateway: "telebirr",
    });
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    await handlePaymentWebhook("telebirr", w.body, w.headers);
    const entries = await prisma.ledgerEntry.findMany({ orderBy: { type: "asc" } });
    expect(entries.map((e) => [e.type, e.organiserId, e.amountSantim])).toEqual([
      ["sale", organiser.id, 100000],
      ["fee", null, 7000],
    ]);
    await expect(prisma.ledgerEntry.update({ where: { id: entries[0]!.id }, data: { amountSantim: 1 } })).rejects.toThrow();
    await expect(prisma.ledgerEntry.delete({ where: { id: entries[0]!.id } })).rejects.toThrow();
  });
});

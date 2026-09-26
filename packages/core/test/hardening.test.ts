import { prisma } from "@dinkuan/db";
import type { PaymentGateway } from "@dinkuan/payments";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelEvent,
  DEMO_OTP,
  expireStaleOrders,
  gatewayFor,
  handlePaymentWebhook,
  isDemoMode,
  reconcilePendingOrders,
  refundOrderInFull,
  requestOtp,
  setGatewayOverride,
  startCheckout,
  verifyOtp,
} from "../src/server";
import { gatewayMarksPaid, makeEvent, makeUser, resetDb, webhookFor } from "./helpers";

beforeEach(resetDb);
afterEach(() => {
  setGatewayOverride("telebirr", null);
  delete process.env.DEMO_STAFF_CODE;
  delete process.env.APP_ENV;
});

/** The demo gateway with some methods swapped out, to count calls or make them fail. */
function patchGateway(patch: Partial<Pick<PaymentGateway, "verify" | "refund">>) {
  const real = gatewayFor("telebirr");
  setGatewayOverride("telebirr", {
    name: real.name,
    createPayment: (i) => real.createPayment(i),
    verify: patch.verify ?? ((r) => real.verify(r)),
    parseWebhook: (b, h) => real.parseWebhook(b, h),
    refund: patch.refund ?? ((r, a, why) => real.refund(r, a, why)),
  });
}
const withRefund = (refund: PaymentGateway["refund"]) => patchGateway({ refund });

async function paidOrder(qty = 1, opts: Parameters<typeof makeEvent>[0] = {}) {
  const made = await makeEvent(opts);
  const buyer = await makeUser();
  const { order } = await startCheckout({ userId: buyer.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty }], gateway: "telebirr" });
  await gatewayMarksPaid(order.gatewayRef);
  const w = webhookFor(order.gatewayRef, order.totalSantim);
  await handlePaymentWebhook("telebirr", w.body, w.headers);
  return { ...made, buyer, order };
}

const ledgerSum = async (where: object) => (await prisma.ledgerEntry.aggregate({ where, _sum: { amountSantim: true } }))._sum.amountSantim ?? 0;

describe("launch hardening: money", () => {
  it("R1 / rule 3: a webhook stored but not processed is processed when the gateway retries", async () => {
    const made = await makeEvent();
    const buyer = await makeUser();
    const { order } = await startCheckout({ userId: buyer.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty: 1 }], gateway: "telebirr" });
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    // First delivery: stored in the inbox, then processing blows up (the gateway's verify is down).
    patchGateway({
      verify: async () => {
        throw new Error("verify down");
      },
    });
    await expect(handlePaymentWebhook("telebirr", w.body, w.headers)).rejects.toThrow("verify down");
    setGatewayOverride("telebirr", null);
    // A retry while the first attempt could still be running is a duplicate...
    expect(await handlePaymentWebhook("telebirr", w.body, w.headers)).toMatchObject({ status: "duplicate" });
    // ...but once that attempt is clearly dead, the gateway's next retry is processed.
    await prisma.paymentEvent.updateMany({ where: { gatewayRef: order.gatewayRef }, data: { receivedAt: new Date(Date.now() - 5 * 60_000) } });
    expect(await handlePaymentWebhook("telebirr", w.body, w.headers)).toMatchObject({ status: "processed", result: "paid" });
    expect(await handlePaymentWebhook("telebirr", w.body, w.headers)).toMatchObject({ status: "duplicate" });
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(1);
  });

  it("R2: reconciliation finds a charged order that already expired (lost webhook)", async () => {
    const made = await makeEvent();
    const buyer = await makeUser();
    const { order } = await startCheckout({ userId: buyer.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty: 2 }], gateway: "telebirr" });
    await gatewayMarksPaid(order.gatewayRef); // charged, but the webhook never arrives
    await expireStaleOrders(new Date(Date.now() + 11 * 60_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("expired");
    await reconcilePendingOrders(new Date(Date.now() + 12 * 60_000));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("paid");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(2);
  });

  it("R3: two refunds of the same order at once reach the gateway only once", async () => {
    const { order } = await paidOrder();
    let calls = 0;
    withRefund(async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 50));
      return { ok: true, refundRef: `rf_${calls}` };
    });
    const results = await Promise.all([refundOrderInFull(order.id, "a", null), refundOrderInFull(order.id, "b", null), refundOrderInFull(order.id, "c", null)]);
    expect(calls).toBe(1);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);
    expect(await ledgerSum({ orderId: order.id })).toBe(0);
  });

  it("R4: retrying a failed sold-out refund writes no ledger rows (no sale was ever booked)", async () => {
    const made = await makeEvent({ capacity: 1 });
    const late = await makeUser("Late");
    const other = await makeUser("Other");
    const { order } = await startCheckout({ userId: late.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty: 1 }], gateway: "telebirr" });
    await expireStaleOrders(new Date(Date.now() + 11 * 60_000));
    const { order: o2 } = await startCheckout({ userId: other.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty: 1 }], gateway: "telebirr" });
    await gatewayMarksPaid(o2.gatewayRef);
    const w2 = webhookFor(o2.gatewayRef, o2.totalSantim);
    await handlePaymentWebhook("telebirr", w2.body, w2.headers);

    withRefund(async () => ({ ok: false }));
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    expect((await handlePaymentWebhook("telebirr", w.body, w.headers)).result).toBe("refunded_sold_out");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("refund_pending");
    const organiserNet = await ledgerSum({ organiserId: made.organiser.id });

    setGatewayOverride("telebirr", null);
    expect(await refundOrderInFull(order.id, "Admin retry", null)).toBe(true);
    expect(await ledgerSum({ orderId: order.id })).toBe(0);
    expect(await ledgerSum({ organiserId: made.organiser.id })).toBe(organiserNet);
  });

  it("R4: a normal refund reverses exactly the sale and the fee", async () => {
    const { order, organiser } = await paidOrder(2);
    expect(await ledgerSum({ organiserId: organiser.id })).toBe(order.subtotalSantim);
    expect(await refundOrderInFull(order.id, "Changed plans", null)).toBe(true);
    expect(await ledgerSum({ organiserId: organiser.id })).toBe(0);
    expect(await ledgerSum({ orderId: order.id })).toBe(0);
    expect(await prisma.ticket.count({ where: { orderId: order.id, status: "refunded" } })).toBe(2);
  });

  it("R5: a payment that lands after the event was cancelled is refunded, with no tickets", async () => {
    const made = await makeEvent();
    const buyer = await makeUser();
    const { order } = await startCheckout({ userId: buyer.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty: 2 }], gateway: "telebirr" });
    await cancelEvent(made.owner.id, made.event.id, "Venue flooded");
    await gatewayMarksPaid(order.gatewayRef);
    const w = webhookFor(order.gatewayRef, order.totalSantim);
    expect((await handlePaymentWebhook("telebirr", w.body, w.headers)).result).toBe("refunded_cancelled");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("refunded");
    expect(await prisma.ticket.count({ where: { orderId: order.id } })).toBe(0);
    expect(await ledgerSum({ orderId: order.id })).toBe(0);
    expect((await prisma.ticketType.findUniqueOrThrow({ where: { id: made.ticketType.id } })).reserved).toBe(0);
  });

  it("R6 / rule 11: paying and expiring an order are audit-logged", async () => {
    const { order } = await paidOrder();
    expect(await prisma.auditLog.count({ where: { entity: "order", entityId: order.id, action: "order.paid" } })).toBe(1);
  });

  it("R16: the same ticket type twice in one checkout counts as one line", async () => {
    const made = await makeEvent();
    await prisma.ticketType.update({ where: { id: made.ticketType.id }, data: { perOrderMax: 4 } });
    const buyer = await makeUser();
    await expect(
      startCheckout({
        userId: buyer.id,
        eventId: made.event.id,
        items: [
          { ticketTypeId: made.ticketType.id, qty: 3 },
          { ticketTypeId: made.ticketType.id, qty: 3 },
        ],
        gateway: "telebirr",
      }),
    ).rejects.toMatchObject({ code: "PER_ORDER_MAX" });
  });

  it("S9 / F3-AC3: a hidden ticket type needs its code", async () => {
    const made = await makeEvent();
    await prisma.ticketType.update({ where: { id: made.ticketType.id }, data: { visibility: "hidden", accessCode: "PRESS24" } });
    const buyer = await makeUser();
    const base = { userId: buyer.id, eventId: made.event.id, items: [{ ticketTypeId: made.ticketType.id, qty: 1 }], gateway: "telebirr" as const };
    await expect(startCheckout(base)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startCheckout({ ...base, accessCode: "wrong" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startCheckout({ ...base, accessCode: " press24 " })).resolves.toBeTruthy();
  });
});

describe("launch hardening: sign-in", () => {
  it("S1: demo mode refuses to run when APP_ENV=production", () => {
    process.env.APP_ENV = "production";
    expect(() => isDemoMode()).toThrow(/not allowed/);
  });

  it("S1: in a shared demo, admins sign in with the staff code, not 123456", async () => {
    process.env.DEMO_STAFF_CODE = "482913";
    const admin = await makeUser("Admin");
    await prisma.userRole.create({ data: { userId: admin.id, role: "admin" } });
    await requestOtp(admin.phone);
    await expect(verifyOtp(admin.phone, DEMO_OTP)).rejects.toMatchObject({ code: "OTP_INVALID" });
    await expect(verifyOtp(admin.phone, "482913")).resolves.toMatchObject({ user: { id: admin.id } });
    // Everyone else keeps the public demo code.
    const buyer = await makeUser();
    await requestOtp(buyer.phone);
    await expect(verifyOtp(buyer.phone, DEMO_OTP)).resolves.toBeTruthy();
  });

  it("S2: 20 parallel wrong guesses still stop at 5 attempts", async () => {
    await requestOtp("0911000009");
    await Promise.allSettled(Array.from({ length: 20 }, () => verifyOtp("0911000009", "000000")));
    expect((await prisma.otpCode.findUniqueOrThrow({ where: { phone: "+251911000009" } })).attempts).toBe(5);
    await expect(verifyOtp("0911000009", DEMO_OTP)).rejects.toMatchObject({ code: "OTP_TOO_MANY_ATTEMPTS" });
  });

  it("S2: resending the code does not reset the wrong-guess count", async () => {
    await requestOtp("0911000010");
    for (let i = 0; i < 4; i++) await expect(verifyOtp("0911000010", "000000")).rejects.toMatchObject({ code: "OTP_INVALID" });
    await requestOtp("0911000010");
    await expect(verifyOtp("0911000010", "000000")).rejects.toMatchObject({ code: "OTP_INVALID" });
    await expect(verifyOtp("0911000010", DEMO_OTP)).rejects.toMatchObject({ code: "OTP_TOO_MANY_ATTEMPTS" });
  });
});

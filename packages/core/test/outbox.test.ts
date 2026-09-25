import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  drainOutbox,
  enqueueEventReminders,
  handlePaymentWebhook,
  OUTBOX_MAX_ATTEMPTS,
  PermanentSendError,
  startCheckout,
  type OutboundToSend,
} from "../src/server";
import { gatewayMarksPaid, makeEvent, makeUser, resetDb, webhookFor } from "./helpers";

beforeEach(resetDb);

async function linkedUser(name = "Linked Buyer") {
  const user = await makeUser(name);
  return prisma.user.update({ where: { id: user.id }, data: { telegramChatId: String(1000 + Math.floor(Math.random() * 1e6)) } });
}

async function buyAndPay(userId: string, eventId: string, ticketTypeId: string, qty = 2) {
  const { order } = await startCheckout({ userId, eventId, items: [{ ticketTypeId, qty }], gateway: "telebirr" });
  await gatewayMarksPaid(order.gatewayRef);
  const hook = webhookFor(order.gatewayRef, order.totalSantim);
  await handlePaymentWebhook("telebirr", hook.body, hook.headers);
  return { order, hook };
}

describe("F7 outbox", () => {
  it("F7-AC3: markOrderPaid queues exactly one ticket delivery, even on a duplicate webhook", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await linkedUser();
    const { order, hook } = await buyAndPay(user.id, event.id, ticketType.id);
    await handlePaymentWebhook("telebirr", hook.body, hook.headers); // duplicate delivery
    const msgs = await prisma.outboundMessage.findMany();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      kind: "tickets_paid",
      channel: "telegram",
      userId: user.id,
      dedupeKey: `tickets:${order.id}`,
      status: "pending",
      payload: { orderId: order.id },
    });
  });

  it("F7-AC3: buyers without Telegram linked get nothing queued", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await makeUser();
    await buyAndPay(user.id, event.id, ticketType.id);
    expect(await prisma.ticket.count()).toBe(2);
    expect(await prisma.outboundMessage.count()).toBe(0);
  });

  it("F7-AC3: drainOutbox sends pending messages and marks them sent", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await linkedUser();
    await buyAndPay(user.id, event.id, ticketType.id);
    const seen: OutboundToSend[] = [];
    const res = await drainOutbox(async (m) => {
      seen.push(m);
    });
    expect(res).toEqual({ sent: 1, failed: 0, retrying: 0 });
    expect(seen[0]).toMatchObject({ kind: "tickets_paid", chatId: user.telegramChatId, lang: "am", attempt: 1 });
    const msg = await prisma.outboundMessage.findFirstOrThrow();
    expect(msg.status).toBe("sent");
    expect(msg.sentAt).not.toBeNull();
    // Nothing left to send.
    expect(await drainOutbox(async () => undefined)).toEqual({ sent: 0, failed: 0, retrying: 0 });
  });

  it("F7-AC3: a failed send is retried with backoff, then marked failed after the last attempt", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await linkedUser();
    await buyAndPay(user.id, event.id, ticketType.id);
    const failing = async () => {
      throw new Error("Telegram is down");
    };
    const start = Date.now();
    expect(await drainOutbox(failing, new Date(start))).toMatchObject({ retrying: 1 });
    // Backoff: an immediate second drain does not retry.
    expect(await drainOutbox(failing, new Date(start + 1000))).toEqual({ sent: 0, failed: 0, retrying: 0 });
    let msg = await prisma.outboundMessage.findFirstOrThrow();
    expect(msg).toMatchObject({ status: "pending", attempts: 1, lastError: "Telegram is down" });
    // Later drains retry until the attempts run out.
    const later = new Date(start + 24 * 3600_000);
    for (let i = 1; i < OUTBOX_MAX_ATTEMPTS; i++) await drainOutbox(failing, later);
    msg = await prisma.outboundMessage.findFirstOrThrow();
    expect(msg).toMatchObject({ status: "failed", attempts: OUTBOX_MAX_ATTEMPTS });
  });

  it("F7-AC3: a retry succeeds after a transient failure", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await linkedUser();
    await buyAndPay(user.id, event.id, ticketType.id);
    await drainOutbox(async () => {
      throw new Error("timeout");
    });
    const res = await drainOutbox(async () => undefined, new Date(Date.now() + 60_000));
    expect(res.sent).toBe(1);
    expect(await prisma.outboundMessage.findFirstOrThrow()).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("F7-AC3: a permanent error (bot blocked) fails at once", async () => {
    const { event, ticketType } = await makeEvent();
    const user = await linkedUser();
    await buyAndPay(user.id, event.id, ticketType.id);
    const res = await drainOutbox(async () => {
      throw new PermanentSendError("Forbidden: bot was blocked by the user");
    });
    expect(res.failed).toBe(1);
    expect(await prisma.outboundMessage.findFirstOrThrow()).toMatchObject({ status: "failed", attempts: 1 });
  });

  it("F7-AC4: reminders are queued once per person per event per window", async () => {
    const soon = await makeEvent({ startsInHours: 2 });
    const tomorrow = await makeEvent({ startsInHours: 20 });
    const far = await makeEvent({ startsInHours: 72 });
    const user = await linkedUser("Holder");
    const unlinked = await makeUser("No Telegram");
    // Several tickets for the same event still mean one reminder.
    await buyAndPay(user.id, soon.event.id, soon.ticketType.id, 3);
    await buyAndPay(user.id, tomorrow.event.id, tomorrow.ticketType.id, 2);
    await buyAndPay(user.id, far.event.id, far.ticketType.id, 1);
    await buyAndPay(unlinked.id, soon.event.id, soon.ticketType.id, 1);

    expect(await enqueueEventReminders()).toBe(2);
    expect(await enqueueEventReminders()).toBe(0); // running again changes nothing
    const reminders = await prisma.outboundMessage.findMany({ where: { kind: { startsWith: "reminder" } }, orderBy: { kind: "asc" } });
    expect(reminders.map((r) => r.dedupeKey).sort()).toEqual(
      [`reminder:24h:${tomorrow.event.id}:${user.id}`, `reminder:3h:${soon.event.id}:${user.id}`].sort(),
    );
    // 20 hours later the "tomorrow" event is inside its 3h window and gets that reminder too.
    expect(await enqueueEventReminders(new Date(Date.now() + 18 * 3600_000))).toBe(1);
    expect(await prisma.outboundMessage.count({ where: { dedupeKey: `reminder:3h:${tomorrow.event.id}:${user.id}` } })).toBe(1);
  });

  it("F7-AC4: refunded or transferred-away tickets get no reminder", async () => {
    const soon = await makeEvent({ startsInHours: 2 });
    const user = await linkedUser();
    await buyAndPay(user.id, soon.event.id, soon.ticketType.id, 1);
    await prisma.ticket.updateMany({ data: { status: "refunded" } });
    expect(await enqueueEventReminders()).toBe(0);
  });
});

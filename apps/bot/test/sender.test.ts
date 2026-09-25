import { fromBase64Url, verifyQr } from "@dinkuan/core";
import { drainOutbox, enqueueEventReminders, ticketQrCodes } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { t } from "@dinkuan/i18n";
import { InputFile } from "grammy";
import { beforeEach, describe, expect, it } from "vitest";
import { createOutboxSender, qrPng } from "../src";
import { buyTickets, makeEvent, makeUser, resetDb, testApi } from "./helpers";

beforeEach(resetDb);

async function fileBytes(file: InputFile): Promise<Buffer> {
  const data = await file.toRaw();
  if (!(data instanceof Uint8Array)) throw new Error("expected an in-memory file");
  return Buffer.from(data);
}

describe("F7-AC3 ticket delivery", () => {
  it("F7-AC3: after payment each ticket arrives as a QR image with the event details", async () => {
    const user = await makeUser({ chatId: 601, lang: "en", name: "Selam" });
    const { event, ticketType } = await makeEvent({ startsAt: new Date(Date.now() + 48 * 3600_000), titleEn: "Meskel Party" });
    await buyTickets(user.id, event.id, ticketType.id, 2);
    const { api, calls } = testApi();

    expect(await drainOutbox(createOutboxSender(api))).toEqual({ sent: 1, failed: 0, retrying: 0 });
    expect(calls[0]!.method).toBe("sendMessage");
    expect(calls[0]!.payload.chat_id).toBe("601");
    expect(calls[0]!.payload.text).toContain(t("en", "bot.tickets.paid", { title: "Meskel Party" }));
    const photos = calls.filter((c) => c.method === "sendPhoto");
    expect(photos).toHaveLength(2);

    const tickets = await prisma.ticket.findMany({ orderBy: { id: "asc" } });
    const withKey = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    for (const [i, photo] of photos.entries()) {
      expect(photo.payload.caption).toContain("Meskel Party");
      expect(photo.payload.caption).toContain("📍 Fendika");
      expect(photo.payload.caption).toContain("Regular · Selam");
      expect(photo.payload.caption).toContain(`Ticket ${i + 1} of 2`);
      // The image is exactly the wallet's static fallback QR, and it verifies with the event's public key.
      const expected = (await ticketQrCodes(tickets[i]!, { minutes: 0 })).static;
      expect(await fileBytes(photo.payload.photo)).toEqual(await qrPng(expected));
      const check = await verifyQr(expected, {
        eventId: event.id,
        publicKey: fromBase64Url(withKey.signingPublicKey!),
        now: new Date(),
      });
      expect(check.ok).toBe(true);
    }
    const payloads = JSON.stringify(calls.map((c) => c.payload.caption ?? c.payload.text ?? ""));
    expect(payloads).not.toContain("privateKey");
    expect(await prisma.outboundMessage.findFirstOrThrow()).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("F7-AC3: a Telegram error leaves the message for a retry, which then delivers it", async () => {
    const user = await makeUser({ chatId: 602 });
    const { event, ticketType } = await makeEvent({ startsAt: new Date(Date.now() + 48 * 3600_000) });
    await buyTickets(user.id, event.id, ticketType.id, 1);
    let down = true;
    const { api, calls } = testApi((method) =>
      down && method === "sendPhoto" ? { error_code: 502, description: "Bad Gateway" } : null,
    );
    const send = createOutboxSender(api);
    expect(await drainOutbox(send)).toEqual({ sent: 0, failed: 0, retrying: 1 });
    expect(await prisma.outboundMessage.findFirstOrThrow()).toMatchObject({ status: "pending", attempts: 1 });
    down = false;
    expect(await drainOutbox(send, new Date(Date.now() + 60_000))).toEqual({ sent: 1, failed: 0, retrying: 0 });
    expect(calls.filter((c) => c.method === "sendPhoto")).toHaveLength(2);
    expect(await prisma.outboundMessage.findFirstOrThrow()).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("F7-AC3: if the person blocked the bot the message fails without retrying", async () => {
    const user = await makeUser({ chatId: 603 });
    const { event, ticketType } = await makeEvent({ startsAt: new Date(Date.now() + 48 * 3600_000) });
    await buyTickets(user.id, event.id, ticketType.id, 1);
    const { api } = testApi(() => ({ error_code: 403, description: "Forbidden: bot was blocked by the user" }));
    expect(await drainOutbox(createOutboxSender(api))).toEqual({ sent: 0, failed: 1, retrying: 0 });
  });
});

describe("F7-AC4 reminders", () => {
  it("F7-AC4: reminders go out 24h and 3h before, once per person, in their language", async () => {
    const user = await makeUser({ chatId: 610, lang: "en" });
    const { event, ticketType } = await makeEvent({ startsAt: new Date(Date.now() + 20 * 3600_000), titleEn: "Rooftop Session" });
    await buyTickets(user.id, event.id, ticketType.id, 3);
    const { api, calls } = testApi();
    const send = createOutboxSender(api);
    await drainOutbox(send); // ticket delivery
    calls.length = 0;

    expect(await enqueueEventReminders()).toBe(1);
    expect(await enqueueEventReminders()).toBe(0);
    await drainOutbox(send);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.payload.text).toContain("⏰ Coming up: Rooftop Session");
    expect(calls[0]!.payload.reply_markup.inline_keyboard[0][0]).toMatchObject({
      text: t("en", "bot.reminder.showTickets"),
      callback_data: "mytickets",
    });

    const later = new Date(Date.now() + 18 * 3600_000);
    expect(await enqueueEventReminders(later)).toBe(1);
    await drainOutbox(send, later);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.payload.text).toContain("⏰ Starting soon: Rooftop Session");
  });

  it("F7-AC4: no reminder for a cancelled event", async () => {
    const user = await makeUser({ chatId: 611 });
    const { event, ticketType } = await makeEvent({ startsAt: new Date(Date.now() + 2 * 3600_000) });
    await buyTickets(user.id, event.id, ticketType.id, 1);
    const { api, calls } = testApi();
    await drainOutbox(createOutboxSender(api));
    calls.length = 0;
    await enqueueEventReminders();
    await prisma.event.update({ where: { id: event.id }, data: { status: "cancelled" } });
    await drainOutbox(createOutboxSender(api));
    expect(calls).toHaveLength(0);
    expect(await prisma.outboundMessage.count({ where: { kind: "reminder_3h", status: "sent" } })).toBe(1);
  });
});

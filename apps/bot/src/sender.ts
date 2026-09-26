import { PermanentSendError, ticketQrCodes, type OutboundSender, type OutboundToSend } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { translator } from "@dinkuan/i18n";
import { Api, GrammyError, InlineKeyboard, InputFile } from "grammy";
import QRCode from "qrcode";
import { z } from "zod";
import { eventTitle, formatDate, formatTime } from "./format";

const ticketsPaidPayload = z.object({ orderId: z.string().uuid() });
const reminderPayload = z.object({ eventId: z.string().uuid() });

/** The ticket QR as a PNG, sized to scan well from a phone screen at the gate. */
export function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 512 });
}

/**
 * Turns outbox messages into Telegram messages (F7-AC3/AC4). Pass it to drainOutbox.
 * Errors that retrying cannot fix (bot blocked, chat gone) become PermanentSendError.
 */
export function createOutboxSender(api: Api): OutboundSender {
  return async (msg) => {
    try {
      switch (msg.kind) {
        case "tickets_paid":
          return await sendTickets(api, msg);
        case "reminder_24h":
        case "reminder_3h":
          return await sendReminder(api, msg, msg.kind);
        default:
          throw new PermanentSendError(`Unknown message kind: ${msg.kind}`);
      }
    } catch (e) {
      if (e instanceof GrammyError && (e.error_code === 403 || /chat not found|user is deactivated/i.test(e.description))) {
        throw new PermanentSendError(e.description);
      }
      throw e;
    }
  };
}

/** Sender for a bot token, for callers that don't hold a Bot (web routes, cron). */
export function createTelegramSender(token: string): OutboundSender {
  return createOutboxSender(new Api(token));
}

/**
 * F7-AC3: one QR image per ticket plus the event details. The QR is the same static fallback
 * payload the wallet shows (window 0), signed on the server; the private key never leaves it.
 */
async function sendTickets(api: Api, msg: OutboundToSend) {
  const { orderId } = ticketsPaidPayload.parse(msg.payload);
  const t = translator(msg.lang);
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { event: { include: { venue: true } } },
  });
  // Only tickets this person still holds (a ticket may have been transferred or refunded since).
  const tickets = await prisma.ticket.findMany({
    where: { orderId, holderUserId: msg.userId, status: "valid" },
    include: { ticketType: true },
    orderBy: [{ ticketType: { sortOrder: "asc" } }, { id: "asc" }],
  });
  if (!tickets.length) return;
  const { event } = order;
  const title = eventTitle(event, msg.lang);
  await api.sendMessage(msg.chatId, `${t("bot.tickets.paid", { title })}\n\n${t("bot.tickets.walletHint")}`, {
    reply_markup: new InlineKeyboard().text(t("bot.mytickets.open"), "mytickets"),
  });
  for (const [i, ticket] of tickets.entries()) {
    const { static: payload } = await ticketQrCodes(ticket, { minutes: 0 });
    const caption = t("bot.tickets.caption", {
      title,
      date: formatDate(event.startsAt, msg.lang),
      time: formatTime(event.startsAt, msg.lang),
      venue: event.venue.name,
      type: ticket.ticketType.name,
      holder: ticket.holderName,
      n: i + 1,
      total: tickets.length,
    });
    await api.sendPhoto(msg.chatId, new InputFile(await qrPng(payload), `ticket-${i + 1}.png`), { caption });
  }
}

/** F7-AC4: event reminder, skipped if the event was cancelled or they no longer hold a ticket. */
async function sendReminder(api: Api, msg: OutboundToSend, kind: "reminder_24h" | "reminder_3h") {
  const { eventId } = reminderPayload.parse(msg.payload);
  const t = translator(msg.lang);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, include: { venue: true } });
  if (event.status !== "published") return;
  const held = await prisma.ticket.count({ where: { eventId, holderUserId: msg.userId, status: "valid" } });
  if (!held) return;
  const text = t(kind === "reminder_24h" ? "bot.reminder.24h" : "bot.reminder.3h", {
    title: eventTitle(event, msg.lang),
    date: formatDate(event.startsAt, msg.lang),
    time: formatTime(event.startsAt, msg.lang),
    venue: event.venue.name,
  });
  await api.sendMessage(msg.chatId, text, {
    reply_markup: new InlineKeyboard().text(t("bot.reminder.showTickets"), "mytickets"),
  });
}

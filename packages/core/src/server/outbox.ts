import { prisma, type Lang, type Prisma } from "@dinkuan/db";

/**
 * Outbound message outbox (F7-AC3/AC4, F13). Messages are written inside the transaction that
 * causes them (e.g. an order becoming paid), then a sender drains them with retries. The
 * unique dedupeKey makes every enqueue idempotent, so a duplicate webhook or a second cron
 * run never sends twice.
 */
export type OutboundChannel = "telegram";
export type OutboundKind = "tickets_paid" | "reminder_24h" | "reminder_3h";

export const OUTBOX_MAX_ATTEMPTS = 5;
/** Retry n waits BASE * (2^n - 1) after the message was created: 30s, 90s, 3.5m, 7.5m. */
export const OUTBOX_BACKOFF_BASE_MS = 30_000;

export interface EnqueueInput {
  channel?: OutboundChannel;
  userId: string;
  kind: OutboundKind;
  payload: Prisma.InputJsonObject;
  dedupeKey: string;
}

/**
 * Queues one message. Skips users who have not linked Telegram. Uses ON CONFLICT DO NOTHING
 * (not a caught unique error), so it is safe inside a caller's transaction.
 * Returns true when a new message was queued.
 */
export async function enqueueOutbound(tx: Prisma.TransactionClient, input: EnqueueInput): Promise<boolean> {
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { telegramChatId: true } });
  if (!user?.telegramChatId) return false;
  const res = await tx.outboundMessage.createMany({
    data: {
      channel: input.channel ?? "telegram",
      userId: input.userId,
      kind: input.kind,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
    },
    skipDuplicates: true,
  });
  return res.count === 1;
}

export interface OutboundToSend {
  id: string;
  kind: string;
  payload: Prisma.JsonValue;
  userId: string;
  chatId: string;
  lang: Lang;
  attempt: number;
}

/** Throw this from a sender when retrying cannot help (e.g. the person blocked the bot). */
export class PermanentSendError extends Error {
  override name = "PermanentSendError";
}

export type OutboundSender = (msg: OutboundToSend) => Promise<void>;

export function nextAttemptAt(createdAt: Date, attempts: number): Date {
  return new Date(createdAt.getTime() + OUTBOX_BACKOFF_BASE_MS * (2 ** attempts - 1));
}

/**
 * Sends pending messages whose backoff has elapsed. Each message is claimed by bumping its
 * attempt count with a compare-and-set, so two drains running at once never send it twice.
 * Success marks it sent; a failure records the error and, after the last attempt (or a
 * PermanentSendError), marks it failed.
 */
export async function drainOutbox(
  send: OutboundSender,
  now = new Date(),
  opts: { channel?: OutboundChannel; limit?: number } = {},
): Promise<{ sent: number; failed: number; retrying: number }> {
  // Same rule as nextAttemptAt, in SQL, so messages still backing off never crowd out due ones.
  const dueIds = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM outbound_messages
    WHERE channel = ${opts.channel ?? "telegram"} AND status::text = 'pending'
      AND created_at + (${OUTBOX_BACKOFF_BASE_MS}::int * (power(2, attempts) - 1)) * interval '1 millisecond' <= ${now}
    ORDER BY created_at ASC
    LIMIT ${opts.limit ?? 50}`;
  const due = await prisma.outboundMessage.findMany({
    where: { id: { in: dueIds.map((r) => r.id) } },
    include: { user: { select: { telegramChatId: true, lang: true } } },
    orderBy: { createdAt: "asc" },
  });
  const result = { sent: 0, failed: 0, retrying: 0 };
  for (const m of due) {
    const claim = await prisma.outboundMessage.updateMany({
      where: { id: m.id, status: "pending", attempts: m.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count !== 1) continue; // another drain took it
    const attempt = m.attempts + 1;
    try {
      if (!m.user.telegramChatId) throw new PermanentSendError("Telegram is no longer linked");
      await send({
        id: m.id,
        kind: m.kind,
        payload: m.payload,
        userId: m.userId,
        chatId: m.user.telegramChatId,
        lang: m.user.lang,
        attempt,
      });
      await prisma.outboundMessage.update({ where: { id: m.id }, data: { status: "sent", sentAt: new Date(), lastError: null } });
      result.sent += 1;
    } catch (e) {
      const permanent = e instanceof PermanentSendError;
      const giveUp = permanent || attempt >= OUTBOX_MAX_ATTEMPTS;
      await prisma.outboundMessage.update({
        where: { id: m.id },
        data: { lastError: String(e instanceof Error ? e.message : e).slice(0, 500), ...(giveUp ? { status: "failed" } : {}) },
      });
      if (giveUp) result.failed += 1;
      else result.retrying += 1;
    }
  }
  return result;
}

export const REMINDER_WINDOWS = [
  { kind: "reminder_3h", tag: "3h", fromMs: 0, toMs: 3 * 3600_000 },
  { kind: "reminder_24h", tag: "24h", fromMs: 3 * 3600_000, toMs: 24 * 3600_000 },
] as const;

/**
 * F7-AC4: queue a reminder 24 hours and 3 hours before each event for everyone holding a
 * valid ticket. The 24h window is (3h, 24h] and the 3h window is (0, 3h] from now, so a
 * late buyer only gets the 3h one. One per person per event per window, however many
 * tickets they hold and however often this runs (dedupeKey).
 */
export async function enqueueEventReminders(now = new Date()): Promise<number> {
  let queued = 0;
  for (const w of REMINDER_WINDOWS) {
    const holders = await prisma.ticket.findMany({
      where: {
        status: "valid",
        holder: { telegramChatId: { not: null } },
        event: {
          status: "published",
          startsAt: { gt: new Date(now.getTime() + w.fromMs), lte: new Date(now.getTime() + w.toMs) },
        },
      },
      distinct: ["eventId", "holderUserId"],
      select: { eventId: true, holderUserId: true },
    });
    for (const h of holders) {
      const added = await enqueueOutbound(prisma, {
        userId: h.holderUserId,
        kind: w.kind,
        payload: { eventId: h.eventId },
        dedupeKey: `reminder:${w.tag}:${h.eventId}:${h.holderUserId}`,
      });
      if (added) queued += 1;
    }
  }
  return queued;
}

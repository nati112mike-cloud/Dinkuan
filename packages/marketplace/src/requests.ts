import { DomainError } from "@dinkuan/core";
import { recordAdConversion } from "@dinkuan/core/server";
import { prisma, type Prisma } from "@dinkuan/db";
import { assertActive, screenText } from "@dinkuan/moderation";
import { ensureProfile, isBlockedEitherWay, notify } from "@dinkuan/social";
import { z } from "zod";
import { addisToday, isoDate, isAvailable, toDate } from "./availability";
import { maskContacts, MESSAGE_MAX, REQUEST_NOTES_MAX } from "./text";
import { refreshVendorStats } from "./vendors";

/** Anti-spam caps per hour (F22-AC9 applied to the marketplace). */
export const MARKET_LIMITS = { requests: 10, messages: 60 } as const;

export const requestInput = z.object({
  vendorId: z.uuid(),
  packageId: z.uuid().nullable().optional(),
  eventDate: isoDate,
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  venue: z.string().trim().min(2).max(120),
  eventType: z.string().trim().min(2).max(60),
  guests: z.number().int().min(1).max(20_000),
  budgetSantim: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  notes: z.string().trim().max(REQUEST_NOTES_MAX).default(""),
});
export type RequestInput = z.input<typeof requestInput>;

/**
 * F20-AC14: a client sends a booking request (date, time, venue, type, guests, budget, notes).
 * It opens a conversation with the vendor. Free text is contact-masked like chat (rule 16).
 */
export async function createRequest(
  clientId: string,
  raw: RequestInput,
  opts: { campaignId?: string | null; now?: Date } = {},
) {
  const input = requestInput.parse(raw);
  const now = opts.now ?? new Date();
  if (input.vendorId === clientId) throw new DomainError("VALIDATION", "You can't book yourself");
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: input.vendorId } });
  if (!vendor) throw new DomainError("NOT_FOUND");
  if (await isBlockedEitherWay(clientId, input.vendorId)) throw new DomainError("BLOCKED");
  await assertActive(clientId, now);
  if (screenText(`${input.notes ?? ""}\n${input.venue ?? ""}`).severity >= 2) throw new DomainError("CONTENT_FLAGGED");
  if (input.eventDate < addisToday(now)) throw new DomainError("VALIDATION", "Pick a future date");
  if (!(await isAvailable(input.vendorId, input.eventDate))) throw new DomainError("DATE_UNAVAILABLE");
  if (input.packageId) {
    const pkg = await prisma.package.findUnique({ where: { id: input.packageId } });
    if (!pkg || pkg.vendorId !== input.vendorId || !pkg.active) throw new DomainError("NOT_FOUND", "Package not found");
  }
  const since = new Date(now.getTime() - 3600_000);
  if ((await prisma.bookingRequest.count({ where: { clientId, createdAt: { gte: since } } })) >= MARKET_LIMITS.requests) {
    throw new DomainError("RATE_LIMITED");
  }
  await ensureProfile(clientId);
  const notes = maskContacts(input.notes);
  const venue = maskContacts(input.venue);

  return prisma.$transaction(async (tx) => {
    const request = await tx.bookingRequest.create({
      data: {
        clientId,
        vendorId: input.vendorId,
        packageId: input.packageId ?? null,
        eventDate: toDate(input.eventDate),
        startTime: input.startTime,
        venue: venue.text,
        // Free text shown to the vendor, so it is masked like the notes (audit S14).
        eventType: maskContacts(input.eventType).text,
        guests: input.guests,
        budgetSantim: input.budgetSantim ?? null,
        notes: notes.text,
        campaignId: opts.campaignId ?? null,
        createdAt: now,
      },
    });
    const conversation = await tx.conversation.create({
      data: { bookingRequestId: request.id, clientId, vendorId: input.vendorId, lastMessageAt: now, clientReadAt: now },
    });
    if (input.notes) {
      await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: clientId,
          body: notes.text,
          originalBody: input.notes,
          masked: notes.masked,
          createdAt: now,
        },
      });
    }
    await tx.vendorProfile.update({ where: { userId: input.vendorId }, data: { requestsCount: { increment: 1 } } });
    await refreshVendorStats(tx, input.vendorId);
    await notify(tx, {
      recipientId: input.vendorId,
      actorId: clientId,
      type: "booking_request",
      href: `/inbox/${conversation.id}`,
    });
    if (opts.campaignId) await recordAdConversion(tx, opts.campaignId, "booking_request", request.id);
    return { request, conversationId: conversation.id };
  });
}

/** The vendor turns a request down (it stays in both inboxes as cancelled). */
export async function declineRequest(vendorId: string, requestId: string) {
  const r = await prisma.bookingRequest.findUnique({ where: { id: requestId } });
  if (!r) throw new DomainError("NOT_FOUND");
  if (r.vendorId !== vendorId) throw new DomainError("FORBIDDEN");
  if (r.status !== "requested") return r;
  return prisma.bookingRequest.update({ where: { id: requestId }, data: { status: "cancelled" } });
}

const conversationInclude = {
  request: { include: { package: true } },
  messages: { orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.ConversationInclude;

/** Inbox: conversations where the member is the client or the vendor, newest first. */
export async function listConversations(userId: string) {
  const rows = await prisma.conversation.findMany({
    where: { OR: [{ clientId: userId }, { vendorId: userId }] },
    include: conversationInclude,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
  });
  const otherIds = rows.map((c) => (c.clientId === userId ? c.vendorId : c.clientId));
  const profiles = await prisma.profile.findMany({ where: { userId: { in: otherIds } } });
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  return rows.map((c) => {
    const asVendor = c.vendorId === userId;
    const readAt = asVendor ? c.vendorReadAt : c.clientReadAt;
    const last = c.messages[0] ?? null;
    return {
      id: c.id,
      asVendor,
      other: byId.get(asVendor ? c.clientId : c.vendorId) ?? null,
      request: c.request,
      lastMessage: last ? { body: visibleBody(last, c.contactUnlocked), mine: last.senderId === userId, at: last.createdAt } : null,
      unread: !!last && last.senderId !== userId && (!readAt || readAt < last.createdAt),
      lastMessageAt: c.lastMessageAt,
    };
  });
}

/** The masked text, unless contact details were unlocked by a paid deposit (rule 16). */
/** Masked until a deposit unlocks contact details (rule 16); empty once a moderator removes it (F22). */
function visibleBody(m: { body: string; originalBody: string; removedAt: Date | null }, unlocked: boolean) {
  if (m.removedAt) return "";
  return unlocked ? m.originalBody : m.body;
}

async function participantConversation(userId: string, conversationId: string) {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!c) throw new DomainError("NOT_FOUND");
  if (c.clientId !== userId && c.vendorId !== userId) throw new DomainError("FORBIDDEN");
  return c;
}

/** F20-AC15: one conversation. Only its two members can read it, and it marks itself read. */
export async function getConversation(userId: string, conversationId: string, now = new Date()) {
  const c = await participantConversation(userId, conversationId);
  const asVendor = c.vendorId === userId;
  const [request, messages, other] = await Promise.all([
    prisma.bookingRequest.findUniqueOrThrow({ where: { id: c.bookingRequestId }, include: { package: true } }),
    prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.profile.findUnique({ where: { userId: asVendor ? c.clientId : c.vendorId } }),
  ]);
  await prisma.conversation.update({
    where: { id: conversationId },
    data: asVendor ? { vendorReadAt: now } : { clientReadAt: now },
  });
  return {
    id: c.id,
    asVendor,
    contactUnlocked: c.contactUnlocked,
    request,
    other,
    messages: messages.map((m) => ({
      id: m.id,
      body: visibleBody(m, c.contactUnlocked),
      masked: m.masked && !c.contactUnlocked && !m.removedAt,
      removed: !!m.removedAt,
      mine: m.senderId === userId,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * F20-AC15 / CLAUDE.md rule 16: send a chat message. Phone numbers, handles and links are
 * masked before anyone sees them. A vendor's first reply sets their auto-calculated response
 * time (F20-AC1).
 */
export async function sendMessage(userId: string, conversationId: string, text: string, now = new Date()) {
  const body = z.string().trim().min(1).max(MESSAGE_MAX).parse(text);
  const c = await participantConversation(userId, conversationId);
  const otherId = c.clientId === userId ? c.vendorId : c.clientId;
  if (await isBlockedEitherWay(userId, otherId)) throw new DomainError("BLOCKED");
  await assertActive(userId, now);
  // F22-AC2: threats, hate, scams and sexual content aren't delivered. Contact details and
  // links are handled by masking instead (rule 16), so plain spam-link hits still go through.
  if (screenText(body).severity >= 2) throw new DomainError("CONTENT_FLAGGED");
  const since = new Date(now.getTime() - 3600_000);
  if ((await prisma.message.count({ where: { senderId: userId, createdAt: { gte: since } } })) >= MARKET_LIMITS.messages) {
    throw new DomainError("RATE_LIMITED");
  }
  const m = maskContacts(body);
  return prisma.$transaction(async (tx) => {
    const isVendor = userId === c.vendorId;
    const firstReply =
      isVendor && (await tx.message.count({ where: { conversationId, senderId: userId } })) === 0;
    const message = await tx.message.create({
      data: { conversationId, senderId: userId, body: m.text, originalBody: body, masked: m.masked, createdAt: now },
    });
    const otherReadAt = isVendor ? c.clientReadAt : c.vendorReadAt;
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, ...(isVendor ? { vendorReadAt: now } : { clientReadAt: now }) },
    });
    if (firstReply) {
      const request = await tx.bookingRequest.findUniqueOrThrow({ where: { id: c.bookingRequestId } });
      const minutes = Math.max(1, Math.round((now.getTime() - request.createdAt.getTime()) / 60_000));
      const v = await tx.vendorProfile.findUniqueOrThrow({ where: { userId } });
      // Running average over every request the vendor has answered.
      const avg = Math.round(((v.responseTimeMin ?? 0) * v.repliedCount + minutes) / (v.repliedCount + 1));
      await tx.vendorProfile.update({
        where: { userId },
        data: { repliedCount: { increment: 1 }, responseTimeMin: avg },
      });
      await refreshVendorStats(tx, userId);
    }
    // One notification per unread stretch, not one per message.
    if (!otherReadAt || otherReadAt >= c.lastMessageAt) {
      await notify(tx, { recipientId: otherId, actorId: userId, type: "message", href: `/inbox/${conversationId}` });
    }
    return { id: message.id, body: message.body, masked: message.masked, removed: false, mine: true, createdAt: message.createdAt };
  });
}

export async function unreadConversations(userId: string) {
  const list = await listConversations(userId);
  return list.filter((c) => c.unread).length;
}

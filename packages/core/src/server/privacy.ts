import { prisma, type Prisma } from "@dinkuan/db";
import { DomainError } from "../errors";
import { audit } from "./audit";

type Tx = Prisma.TransactionClient;

/** Versions of the documents people accept at sign-up (CLAUDE.md rule 12, PRD 3 data protection). */
export const TERMS_CONSENT = "terms:v1";
export const PRIVACY_CONSENT = "privacy:v1";

/** Logs acceptance of the terms and the privacy policy once each. */
export async function acceptLegal(userId: string) {
  for (const type of [TERMS_CONSENT, PRIVACY_CONSENT]) {
    const has = await prisma.consent.count({ where: { userId, type, granted: true } });
    if (!has) await prisma.consent.create({ data: { userId, type, granted: true } });
  }
}

const EXPORT_VERSION = 1;

/**
 * PDPP 1321/2024: everything ድንኳን holds about a member, as JSON. Secrets (session and OTP
 * hashes, signing keys, QR secrets) and other people's private data are left out.
 */
export async function exportUserData(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, name: true, email: true, lang: true, telegramChatId: true, createdAt: true, suspendedUntil: true, bannedAt: true },
  });
  if (!user) throw new DomainError("NOT_FOUND");
  const own = { userId };
  const [
    roles,
    consents,
    profile,
    interests,
    posts,
    comments,
    reactions,
    shares,
    savedPosts,
    following,
    followers,
    blocks,
    mutes,
    savedEvents,
    orders,
    tickets,
    transfers,
    organisers,
    memberships,
    vendorProfile,
    bookingRequests,
    messages,
    reviews,
    shortlists,
    campaigns,
    reports,
    moderation,
    appeals,
    notifications,
    uploads,
  ] = await Promise.all([
    prisma.userRole.findMany({ where: own, select: { role: true } }),
    prisma.consent.findMany({ where: own, select: { type: true, granted: true, createdAt: true } }),
    prisma.profile.findUnique({ where: own }),
    prisma.userInterest.findMany({ where: own, select: { interest: true } }),
    prisma.post.findMany({ where: { authorId: userId }, include: { media: { select: { kind: true, url: true, thumbUrl: true } } } }),
    prisma.comment.findMany({ where: { authorId: userId }, select: { id: true, postId: true, body: true, status: true, createdAt: true } }),
    prisma.reaction.findMany({ where: own, select: { postId: true, type: true, createdAt: true } }),
    prisma.share.findMany({ where: own, select: { postId: true, type: true, comment: true, createdAt: true } }),
    prisma.savedPost.findMany({ where: own, select: { postId: true, collection: true, createdAt: true } }),
    prisma.follow.findMany({ where: { followerId: userId }, select: { followeeId: true, status: true, createdAt: true } }),
    prisma.follow.findMany({ where: { followeeId: userId }, select: { followerId: true, status: true, createdAt: true } }),
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true, createdAt: true } }),
    prisma.mute.findMany({ where: { muterId: userId }, select: { mutedId: true, createdAt: true } }),
    prisma.savedEvent.findMany({ where: own, select: { eventId: true, createdAt: true } }),
    prisma.order.findMany({
      where: own,
      select: {
        number: true,
        eventId: true,
        status: true,
        subtotalSantim: true,
        feeSantim: true,
        totalSantim: true,
        gateway: true,
        createdAt: true,
        paidAt: true,
        items: { select: { ticketTypeId: true, qty: true, unitPriceSantim: true } },
      },
    }),
    prisma.ticket.findMany({ where: { holderUserId: userId }, select: { id: true, eventId: true, ticketTypeId: true, holderName: true, status: true, checkedInAt: true } }),
    prisma.ticketTransfer.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { ticketId: true, fromUserId: true, toUserId: true, createdAt: true },
    }),
    prisma.organiser.findMany({ where: { ownerUserId: userId } }),
    prisma.organiserMember.findMany({ where: own, select: { organiserId: true, role: true } }),
    prisma.vendorProfile.findUnique({ where: own, include: { packages: true, albums: { include: { items: true } } } }),
    prisma.bookingRequest.findMany({ where: { clientId: userId } }),
    prisma.message.findMany({ where: { senderId: userId }, select: { conversationId: true, originalBody: true, createdAt: true } }),
    prisma.review.findMany({ where: { clientId: userId } }),
    prisma.shortlist.findMany({ where: own, include: { items: { select: { vendorId: true } } } }),
    prisma.campaign.findMany({ where: { advertiserId: userId } }),
    prisma.report.findMany({ where: { reporterId: userId }, select: { targetType: true, targetId: true, reason: true, details: true, status: true, createdAt: true } }),
    // Decisions about the member, without naming the moderator.
    prisma.moderationAction.findMany({
      where: { subjectId: userId },
      select: { id: true, targetType: true, targetId: true, action: true, reason: true, overturnedAt: true, createdAt: true },
    }),
    prisma.appeal.findMany({ where: own, select: { actionId: true, text: true, status: true, createdAt: true, decidedAt: true } }),
    prisma.notification.findMany({ where: { recipientId: userId }, select: { type: true, postId: true, href: true, readAt: true, createdAt: true } }),
    prisma.mediaBlob.findMany({ where: { uploaderId: userId }, select: { id: true, contentType: true, size: true, createdAt: true } }),
  ]);
  return {
    format: "dinkuan-export",
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    note: "Money amounts are in santim (100 santim = 1 Birr). Uploaded files are listed by id; open /api/media/<id> while signed in to download them.",
    account: { ...user, roles: roles.map((r) => r.role) },
    consents,
    social: { profile, interests: interests.map((i) => i.interest), posts, comments, reactions, shares, savedPosts, following, followers, blocks, mutes },
    events: { savedEvents, orders, tickets, transfers, organisers, organiserMemberships: memberships },
    marketplace: { vendorProfile, bookingRequests, messagesSent: messages, reviewsWritten: reviews, shortlists },
    promotion: { campaigns },
    safety: { reportsFiled: reports, decisionsAboutYou: moderation, appeals },
    notifications,
    uploads,
  };
}

/** Why an account can't be deleted yet: things that would leave someone else out of pocket. */
export async function deletionBlockers(userId: string, now = new Date()) {
  const [tickets, pendingOrders, liveEvents, campaigns] = await Promise.all([
    prisma.ticket.count({ where: { holderUserId: userId, status: "valid", event: { endsAt: { gt: now } } } }),
    prisma.order.count({ where: { userId, status: { in: ["pending", "refund_pending"] } } }),
    prisma.event.count({ where: { organiser: { ownerUserId: userId }, status: { in: ["published", "pending_review"] }, endsAt: { gt: now } } }),
    prisma.campaign.count({ where: { advertiserId: userId, status: { in: ["pending_payment", "pending_review", "active", "paused"] } } }),
  ]);
  const out: ("tickets" | "orders" | "events" | "campaigns")[] = [];
  if (tickets) out.push("tickets");
  if (pendingOrders) out.push("orders");
  if (liveEvents) out.push("events");
  if (campaigns) out.push("campaigns");
  return out;
}

/** Keeps denormalised counters right as the member's activity disappears (CLAUDE.md rule 18). */
async function unwindCounters(tx: Tx, userId: string) {
  const follows = await tx.follow.findMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }], status: "active" } });
  for (const f of follows) {
    if (f.followerId === userId) await tx.profile.updateMany({ where: { userId: f.followeeId }, data: { followersCount: { decrement: 1 } } });
    else await tx.profile.updateMany({ where: { userId: f.followerId }, data: { followingCount: { decrement: 1 } } });
  }
  const reactions = await tx.reaction.findMany({ where: { userId, post: { authorId: { not: userId } } }, include: { post: { select: { authorId: true } } } });
  for (const r of reactions) {
    await tx.post.update({ where: { id: r.postId }, data: { reactionCount: { decrement: 1 } } });
    await tx.profile.updateMany({ where: { userId: r.post.authorId }, data: { likesReceived: { decrement: 1 } } });
  }
  const comments = await tx.comment.groupBy({ by: ["postId"], where: { authorId: userId, status: "visible", post: { authorId: { not: userId } } }, _count: true });
  for (const c of comments) await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: c._count } } });
  // Replies by other people to the member's comments go with them.
  const replies = await tx.comment.groupBy({
    by: ["postId"],
    where: { status: "visible", authorId: { not: userId }, parent: { authorId: userId }, post: { authorId: { not: userId } } },
    _count: true,
  });
  for (const c of replies) await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: c._count } } });
  const shares = await tx.share.groupBy({ by: ["postId"], where: { userId, post: { authorId: { not: userId } } }, _count: true });
  for (const s of shares) await tx.post.update({ where: { id: s.postId }, data: { shareCount: { decrement: s._count } } });
  const likes = await tx.commentLike.findMany({ where: { userId } });
  for (const l of likes) await tx.comment.update({ where: { id: l.commentId }, data: { likeCount: { decrement: 1 } } });
}

/**
 * PDPP 1321/2024: the member deletes their account. Their profile, posts, comments, uploads,
 * follows, chats and reviews go. Orders, tickets and ledger rows stay (the law and the
 * organisers' books need them) but are no longer linked to a name or phone number.
 * Refused while it would strand someone: upcoming tickets, open orders, live events or promotions.
 */
export async function deleteAccount(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) throw new DomainError("NOT_FOUND");
  const blockers = await deletionBlockers(userId, now);
  if (blockers.length) throw new DomainError("ACCOUNT_HAS_OBLIGATIONS", blockers.join(","));

  await prisma.$transaction(
    async (tx) => {
      await unwindCounters(tx, userId);
      const reviewedVendors = await tx.review.findMany({ where: { clientId: userId }, select: { vendorId: true }, distinct: ["vendorId"] });

      // Social: everything they posted or did, and everything about them in other people's lists.
      await tx.post.deleteMany({ where: { authorId: userId } });
      await tx.comment.deleteMany({ where: { authorId: userId } });
      await tx.reaction.deleteMany({ where: { userId } });
      await tx.commentLike.deleteMany({ where: { userId } });
      await tx.share.deleteMany({ where: { userId } });
      await tx.savedPost.deleteMany({ where: { userId } });
      await tx.mention.deleteMany({ where: { userId } });
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await tx.mute.deleteMany({ where: { OR: [{ muterId: userId }, { mutedId: userId }] } });
      await tx.userInterest.deleteMany({ where: { userId } });
      await tx.watchEvent.updateMany({ where: { userId }, data: { userId: null } });
      await tx.notification.deleteMany({ where: { OR: [{ recipientId: userId }, { actorId: userId }] } });
      await tx.profile.deleteMany({ where: { userId } });

      // Marketplace: their pro profile and reviews go; messages they sent are blanked in the other person's inbox.
      await tx.review.deleteMany({ where: { clientId: userId } });
      for (const { vendorId } of reviewedVendors) {
        const agg = await tx.review.aggregate({ where: { vendorId, removedAt: null }, _avg: { stars: true }, _count: true });
        await tx.vendorProfile.updateMany({ where: { userId: vendorId }, data: { ratingAvg: Math.round((agg._avg.stars ?? 0) * 100), ratingCount: agg._count } });
      }
      await tx.vendorProfile.deleteMany({ where: { userId } });
      await tx.message.updateMany({ where: { senderId: userId }, data: { body: "", originalBody: "", removedAt: now } });
      await tx.bookingRequest.updateMany({ where: { clientId: userId }, data: { notes: "", venue: "" } });
      await tx.shortlist.deleteMany({ where: { userId } });

      // Safety records: their reports and appeals go; decisions stay so the audit trail holds.
      await tx.report.deleteMany({ where: { reporterId: userId } });
      await tx.appeal.deleteMany({ where: { userId } });
      await tx.strike.deleteMany({ where: { userId } });

      // Events: keep the money trail, drop the personal details.
      await tx.ticket.updateMany({ where: { holderUserId: userId }, data: { holderName: "Deleted member" } });
      await tx.savedEvent.deleteMany({ where: { userId } });
      await tx.organiserMember.deleteMany({ where: { userId } });
      await tx.organiser.updateMany({ where: { ownerUserId: userId }, data: { licenceUrl: null } });

      // Uploads (photos, videos, licences) are deleted outright.
      await tx.mediaBlob.deleteMany({ where: { uploaderId: userId } });

      // Access: sign out everywhere and free the phone number for a fresh account.
      await tx.session.deleteMany({ where: { userId } });
      await tx.telegramLoginToken.deleteMany({ where: { userId } });
      await tx.outboundMessage.deleteMany({ where: { userId } });
      await tx.otpCode.deleteMany({ where: { phone: user.phone } });
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.user.update({
        where: { id: userId },
        data: { phone: `deleted:${userId}`, name: null, email: null, telegramChatId: null, deletedAt: now },
      });
      await tx.consent.create({ data: { userId, type: "account_deleted", granted: true, createdAt: now } });
      await audit({ actorUserId: userId, action: "account.delete", entity: "user", entityId: userId }, tx);
    },
    { timeout: 60_000 },
  );
}

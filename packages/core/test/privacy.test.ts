import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { acceptLegal, createSession, deleteAccount, exportUserData, findOrCreateUserByPhone, PRIVACY_CONSENT, TERMS_CONSENT, userForSession } from "../src/server";
import { makeEvent, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function profile(userId: string, username: string) {
  return prisma.profile.create({ data: { userId, username, displayName: username, referralCode: username.toUpperCase().slice(0, 8) } });
}

/** A member with a bit of everything: posts, a comment, a like, follows, a paid order and a past ticket. */
async function busyMember() {
  const me = await makeUser("Selam");
  const friend = await makeUser("Friend");
  await profile(me.id, "selam");
  await profile(friend.id, "friend");
  const blob = await prisma.mediaBlob.create({ data: { uploaderId: me.id, contentType: "image/jpeg", size: 3, received: 3, bytes: Buffer.from([1, 2, 3]) } });
  const mine = await prisma.post.create({
    data: { authorId: me.id, type: "photo", caption: "My night out", status: "public", media: { create: { kind: "image", url: `/api/media/${blob.id}`, width: 1, height: 1 } } },
  });
  const theirs = await prisma.post.create({ data: { authorId: friend.id, type: "text", caption: "Hello", status: "public", reactionCount: 1, commentCount: 1 } });
  await prisma.reaction.create({ data: { userId: me.id, postId: theirs.id, type: "like" } });
  await prisma.profile.update({ where: { userId: friend.id }, data: { likesReceived: 1, followersCount: 1, followingCount: 1 } });
  await prisma.profile.update({ where: { userId: me.id }, data: { followersCount: 1, followingCount: 1 } });
  await prisma.comment.create({ data: { postId: theirs.id, authorId: me.id, body: "Nice!" } });
  await prisma.follow.createMany({
    data: [
      { followerId: me.id, followeeId: friend.id, status: "active" },
      { followerId: friend.id, followeeId: me.id, status: "active" },
    ],
  });
  // A past event with a paid order and a used ticket.
  const { event, ticketType } = await makeEvent({ startsInHours: -48 });
  await prisma.event.update({ where: { id: event.id }, data: { endsAt: new Date(Date.now() - 40 * 3600_000) } });
  const order = await prisma.order.create({
    data: {
      userId: me.id,
      eventId: event.id,
      status: "paid",
      subtotalSantim: 50_000,
      feeSantim: 2_500,
      totalSantim: 52_500,
      gateway: "telebirr",
      gatewayRef: `ref-${me.id}`,
      holdsReservation: false,
      expiresAt: new Date(),
      paidAt: new Date(),
      items: { create: { ticketTypeId: ticketType.id, qty: 1, unitPriceSantim: 50_000 } },
    },
  });
  await prisma.ticket.create({ data: { orderId: order.id, ticketTypeId: ticketType.id, eventId: event.id, holderUserId: me.id, holderName: "Selam", status: "valid" } });
  await acceptLegal(me.id);
  return { me, friend, mine, theirs, blob, order };
}

describe("PDPP data export and deletion", () => {
  it("PRD 3: accepting the terms and privacy policy is logged as consents, once each", async () => {
    const u = await makeUser();
    await acceptLegal(u.id);
    await acceptLegal(u.id);
    const rows = await prisma.consent.findMany({ where: { userId: u.id }, orderBy: { type: "asc" } });
    expect(rows.map((r) => r.type)).toEqual([PRIVACY_CONSENT, TERMS_CONSENT]);
  });

  it("PDPP: the export holds the member's account, posts, orders and consents, and no secrets", async () => {
    const { me, mine, order } = await busyMember();
    await createSession(me.id);
    const data = await exportUserData(me.id);
    expect(data.account).toMatchObject({ id: me.id, phone: me.phone, name: "Selam", roles: ["buyer"] });
    expect(data.social.posts.map((p) => p.id)).toEqual([mine.id]);
    expect(data.social.comments).toHaveLength(1);
    expect(data.events.orders).toMatchObject([{ number: order.number, totalSantim: 52_500, items: [{ qty: 1 }] }]);
    expect(data.consents.map((c) => c.type).sort()).toEqual([PRIVACY_CONSENT, TERMS_CONSENT]);
    const json = JSON.stringify(data);
    expect(json).not.toMatch(/tokenHash|token_hash|codeHash|private_key/i);
  });

  it("PDPP: deleting removes social data and uploads, keeps the money trail, fixes counters and frees the phone", async () => {
    const { me, friend, mine, theirs, blob, order } = await busyMember();
    const token = await createSession(me.id);
    const ledgerBefore = await prisma.ledgerEntry.count();

    await deleteAccount(me.id);

    expect(await userForSession(token)).toBeNull();
    const gone = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(gone).toMatchObject({ name: null, email: null, telegramChatId: null });
    expect(gone.phone).not.toBe(me.phone);
    expect(gone.deletedAt).not.toBeNull();
    expect(await prisma.profile.findUnique({ where: { userId: me.id } })).toBeNull();
    expect(await prisma.post.findUnique({ where: { id: mine.id } })).toBeNull();
    expect(await prisma.mediaBlob.findUnique({ where: { id: blob.id } })).toBeNull();
    expect(await prisma.comment.count({ where: { authorId: me.id } })).toBe(0);

    // Other people's counters no longer include the deleted member.
    expect(await prisma.post.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ reactionCount: 0, commentCount: 0 });
    expect(await prisma.profile.findUniqueOrThrow({ where: { userId: friend.id } })).toMatchObject({ likesReceived: 0, followersCount: 0, followingCount: 0 });

    // Orders, tickets and the ledger stay, without the name.
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ totalSantim: 52_500, userId: me.id });
    expect((await prisma.ticket.findFirstOrThrow({ where: { orderId: order.id } })).holderName).toBe("Deleted member");
    expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);
    expect(await prisma.auditLog.count({ where: { action: "account.delete", entityId: me.id } })).toBe(1);

    // The same phone can sign up again as a brand-new member.
    const again = await findOrCreateUserByPhone(me.phone);
    expect(again.isNew).toBe(true);
    expect(again.user.id).not.toBe(me.id);
  });

  it("PDPP: deletion waits while it would strand someone (upcoming tickets, live events)", async () => {
    const buyer = await makeUser("Buyer");
    const { event, ticketType, owner } = await makeEvent({ startsInHours: 48 });
    await prisma.event.update({ where: { id: event.id }, data: { endsAt: new Date(Date.now() + 52 * 3600_000) } });
    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        eventId: event.id,
        status: "paid",
        subtotalSantim: 50_000,
        feeSantim: 0,
        totalSantim: 50_000,
        gateway: "telebirr",
        gatewayRef: `ref-${buyer.id}`,
        holdsReservation: false,
        expiresAt: new Date(),
      },
    });
    await prisma.ticket.create({ data: { orderId: order.id, ticketTypeId: ticketType.id, eventId: event.id, holderUserId: buyer.id, holderName: "Buyer" } });
    await expect(deleteAccount(buyer.id)).rejects.toMatchObject({ code: "ACCOUNT_HAS_OBLIGATIONS", message: "tickets" });
    await expect(deleteAccount(owner.id)).rejects.toMatchObject({ code: "ACCOUNT_HAS_OBLIGATIONS", message: "events" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: buyer.id } })).deletedAt).toBeNull();
  });
});

import { prisma } from "@dinkuan/db";
import { block } from "@dinkuan/social";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createRequest,
  declineRequest,
  getConversation,
  listConversations,
  MARKET_LIMITS,
  MASK,
  sendMessage,
  setBlockedDates,
} from "../src";
import { inDays, member, resetDb, vendor } from "./helpers";

beforeEach(resetDb);

const request = (vendorId: string, extra: Record<string, unknown> = {}) => ({
  vendorId,
  eventDate: inDays(40),
  startTime: "18:00",
  venue: "Hilton Addis",
  eventType: "Wedding",
  guests: 300,
  budgetSantim: 3_000_000,
  notes: "Afro-house after dinner please",
  ...extra,
});

describe("F20 booking requests & chat", () => {
  it("F20-AC14: a client sends a request with date, time, venue, type, guests, budget and notes", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const { request: r, conversationId } = await createRequest(client.id, request(dj.id));
    expect(r).toMatchObject({ status: "requested", startTime: "18:00", venue: "Hilton Addis", guests: 300, budgetSantim: 3_000_000 });
    expect(await prisma.notification.count({ where: { recipientId: dj.id, type: "booking_request" } })).toBe(1);
    const vendorInbox = await listConversations(dj.id);
    expect(vendorInbox).toMatchObject([{ id: conversationId, asVendor: true, unread: true, other: { displayName: "Client" } }]);
    expect((await listConversations(client.id))[0]).toMatchObject({ asVendor: false, unread: false });
    expect((await prisma.vendorProfile.findUniqueOrThrow({ where: { userId: dj.id } })).requestsCount).toBe(1);
  });

  it("F20-AC14: requests are refused for blocked dates, past dates, yourself and people who blocked you", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    await setBlockedDates(dj.id, { block: [inDays(40)] });
    await expect(createRequest(client.id, request(dj.id))).rejects.toMatchObject({ code: "DATE_UNAVAILABLE" });
    await expect(createRequest(client.id, request(dj.id, { eventDate: inDays(-2) }))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createRequest(dj.id, request(dj.id, { eventDate: inDays(41) }))).rejects.toMatchObject({ code: "VALIDATION" });
    await block(dj.id, client.id);
    await expect(createRequest(client.id, request(dj.id, { eventDate: inDays(41) }))).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("F20-AC15 / rule 16: phone numbers, handles and links are masked in chat and request notes", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const { conversationId } = await createRequest(client.id, request(dj.id, { notes: "Call me on 0911 22 33 44 to talk" }));
    const sent = await sendMessage(dj.id, conversationId, "Sure! Or text @djkaleb / ዜሮ ዘጠኝ አንድ አንድ ሁለት ሁለት ሶስት ሶስት አራት አራት");
    expect(sent.masked).toBe(true);
    const convo = await getConversation(client.id, conversationId);
    expect(convo.contactUnlocked).toBe(false);
    const bodies = convo.messages.map((m) => m.body).join("\n");
    expect(bodies).not.toMatch(/0911|22 33 44|djkaleb|ዘጠኝ/);
    expect(bodies).toContain(MASK);
    expect(convo.messages.every((m) => m.masked)).toBe(true);
    expect(convo.request.notes).toBe(`Call me on ${MASK} to talk`);
    // The vendor sees the masked version too; nobody can read the original before a deposit.
    const vendorView = await getConversation(dj.id, conversationId);
    expect(JSON.stringify(vendorView)).not.toContain("0911");
    expect((await listConversations(client.id))[0]!.lastMessage?.body).not.toContain("djkaleb");
  });

  it("F20-AC15: only the client and the vendor can read or write the conversation", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const nosy = await member("Nosy");
    const { conversationId } = await createRequest(client.id, request(dj.id));
    await expect(getConversation(nosy.id, conversationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(sendMessage(nosy.id, conversationId, "hi")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await block(client.id, dj.id);
    await expect(sendMessage(dj.id, conversationId, "hi")).rejects.toMatchObject({ code: "BLOCKED" });
  });

  it("F20-AC1: response time is calculated from the vendor's first reply to each request", async () => {
    const dj = await vendor("Kaleb");
    const a = await member("A");
    const b = await member("B");
    const t0 = new Date();
    const r1 = await createRequest(a.id, request(dj.id), { now: t0 });
    const r2 = await createRequest(b.id, request(dj.id, { eventDate: inDays(50) }), { now: t0 });
    await sendMessage(dj.id, r1.conversationId, "Hello!", new Date(t0.getTime() + 30 * 60_000));
    await sendMessage(dj.id, r1.conversationId, "Still there?", new Date(t0.getTime() + 300 * 60_000));
    await sendMessage(dj.id, r2.conversationId, "Hi!", new Date(t0.getTime() + 90 * 60_000));
    const v = await prisma.vendorProfile.findUniqueOrThrow({ where: { userId: dj.id } });
    expect(v).toMatchObject({ responseTimeMin: 60, repliedCount: 2, requestsCount: 2 });
  });

  it("F20-AC14: the vendor can decline a request", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const { request: r } = await createRequest(client.id, request(dj.id));
    await expect(declineRequest(client.id, r.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await declineRequest(dj.id, r.id)).status).toBe("cancelled");
  });

  it("F22-AC9: requests and messages are rate limited", async () => {
    const client = await member("Client");
    const djs = await Promise.all(Array.from({ length: MARKET_LIMITS.requests + 1 }, (_, i) => vendor(`DJ ${i}`)));
    for (const dj of djs.slice(0, MARKET_LIMITS.requests)) await createRequest(client.id, request(dj.id));
    await expect(createRequest(client.id, request(djs.at(-1)!.id))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("F22 moderation in marketplace chat", () => {
  it("F22-AC2: threats and scams aren't delivered; suspended members can't message", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const { conversationId } = await createRequest(client.id, request(dj.id));
    await expect(sendMessage(dj.id, conversationId, "Pay up or I will kill you")).rejects.toMatchObject({ code: "CONTENT_FLAGGED" });
    await expect(createRequest(client.id, request(dj.id, { eventDate: inDays(45), notes: "guaranteed profit, send birr to win" }))).rejects.toMatchObject({
      code: "CONTENT_FLAGGED",
    });
    await prisma.user.update({ where: { id: client.id }, data: { suspendedUntil: new Date(Date.now() + 86400_000) } });
    await expect(sendMessage(client.id, conversationId, "hello")).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
  });

  it("F22-AC4: a message a moderator removed shows as removed to both sides", async () => {
    const dj = await vendor("Kaleb");
    const client = await member("Client");
    const { conversationId } = await createRequest(client.id, request(dj.id));
    const m = await sendMessage(client.id, conversationId, "something rude");
    await prisma.message.update({ where: { id: m.id }, data: { removedAt: new Date() } });
    for (const who of [client.id, dj.id]) {
      const convo = await getConversation(who, conversationId);
      expect(convo.messages.find((x) => x.id === m.id)).toMatchObject({ removed: true, body: "" });
    }
    expect((await listConversations(dj.id))[0]!.lastMessage?.body).toBe("");
  });
});

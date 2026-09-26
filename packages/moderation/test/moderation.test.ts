import { createSession, userForSession } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptGuidelines,
  assertActive,
  decideAppeal,
  decisionFor,
  fileAppeal,
  fileReport,
  flagContent,
  GUIDELINES_CONSENT,
  hasAcceptedGuidelines,
  liveStrikes,
  moderate,
  moderationQueue,
} from "../src";
import { chatMessage, member, moderator, post, resetDb } from "./helpers";

beforeEach(resetDb);

const HOUR = 3600_000;
const DAY = 24 * HOUR;

describe("F22-AC1 guidelines", () => {
  it("F22-AC1: accepting the guidelines is logged as a consent, once", async () => {
    const u = await member();
    expect(await hasAcceptedGuidelines(u.id)).toBe(false);
    await acceptGuidelines(u.id);
    await acceptGuidelines(u.id);
    expect(await prisma.consent.count({ where: { userId: u.id, type: GUIDELINES_CONSENT, granted: true } })).toBe(1);
    expect(await hasAcceptedGuidelines(u.id)).toBe(true);
  });
});

describe("F22-AC3 reports", () => {
  it("F22-AC3: posts, comments, profiles, messages and reviews can all be reported with a reason", async () => {
    const [author, reporter] = [await member("Author"), await member("Reporter")];
    const p = await post(author.id);
    const c = await prisma.comment.create({ data: { postId: p.id, authorId: author.id, body: "hi" } });
    const m = await chatMessage(reporter.id, author.id, author.id, "rude");
    const vendor = await member("Vendor");
    await prisma.vendorProfile.create({ data: { userId: vendor.id, headline: "Photographer" } });
    const r = await prisma.review.create({
      data: { clientId: author.id, vendorId: vendor.id, stars: 1, punctuality: 1, quality: 1, value: 1, communication: 1, body: "fake" },
    });
    for (const [targetType, targetId] of [
      ["post", p.id],
      ["comment", c.id],
      ["profile", author.id],
      ["message", m.id],
      ["review", r.id],
    ] as const) {
      const rep = await fileReport(reporter.id, { targetType, targetId, reason: "harassment" });
      expect(rep).toMatchObject({ targetType, subjectId: author.id, severity: 2, status: "open" });
    }
  });

  it("F22-AC3: one report per person per item; you can't report yourself or chats you're not in", async () => {
    const [author, reporter, outsider] = [await member(), await member(), await member()];
    const p = await post(author.id);
    const a = await fileReport(reporter.id, { targetType: "post", targetId: p.id, reason: "spam" });
    const b = await fileReport(reporter.id, { targetType: "post", targetId: p.id, reason: "scam" });
    expect(b.id).toBe(a.id);
    await expect(fileReport(author.id, { targetType: "post", targetId: p.id, reason: "spam" })).rejects.toMatchObject({ code: "VALIDATION" });
    const m = await chatMessage(reporter.id, author.id, author.id);
    await expect(fileReport(outsider.id, { targetType: "message", targetId: m.id, reason: "harassment" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("F22-AC7: a child-safety report hides the post at once, before a moderator sees it", async () => {
    const [author, reporter] = [await member(), await member()];
    const p = await post(author.id);
    const r = await fileReport(reporter.id, { targetType: "post", targetId: p.id, reason: "child_safety" });
    expect(r.severity).toBe(4);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("restricted");
  });
});

describe("F22-AC4 moderator queue", () => {
  it("F22-AC4: sorted by severity, then report count, then oldest; urgent items are due in 1 hour", async () => {
    const author = await member("Author");
    const reporters = await Promise.all([1, 2, 3].map((i) => member(`R${i}`)));
    const spamOne = await post(author.id, "one");
    const spamTwo = await post(author.id, "two");
    const threat = await post(author.id, "three");
    await fileReport(reporters[0]!.id, { targetType: "post", targetId: spamOne.id, reason: "spam" });
    for (const r of reporters) await fileReport(r.id, { targetType: "post", targetId: spamTwo.id, reason: "spam" });
    await fileReport(reporters[0]!.id, { targetType: "post", targetId: threat.id, reason: "threat" });
    await prisma.report.updateMany({ where: { targetId: threat.id }, data: { createdAt: new Date(Date.now() - 2 * HOUR) } });

    const q = await moderationQueue();
    expect(q.map((i) => i.targetId)).toEqual([threat.id, spamTwo.id, spamOne.id]);
    expect(q[0]).toMatchObject({ severity: 4, reports: 1, overdue: true });
    expect(q[0]!.dueAt.getTime() - q[0]!.oldestAt.getTime()).toBe(HOUR);
    expect(q[1]).toMatchObject({ severity: 1, reports: 3, overdue: false });
    expect(q[1]!.dueAt.getTime() - q[1]!.oldestAt.getTime()).toBe(DAY);
    expect(q[1]!.subject).toMatchObject({ id: author.id, strikes: 0, state: "active" });
  });

  it("F22-AC4: screening flags join the same queue once per item", async () => {
    const author = await member();
    const p = await post(author.id, "bit.ly/x", "restricted");
    await flagContent(prisma, { targetType: "post", targetId: p.id, subjectId: author.id, category: "spam", severity: 1 });
    await flagContent(prisma, { targetType: "post", targetId: p.id, subjectId: author.id, category: "threat", severity: 4 });
    const [item] = await moderationQueue();
    expect(item).toMatchObject({ targetId: p.id, automated: true, reports: 1, severity: 4 });
  });

  it("F22-AC4: remove is recorded, audit-logged, closes the reports and tells the author", async () => {
    const [author, reporter, mod] = [await member(), await member(), await moderator()];
    const p = await post(author.id);
    await fileReport(reporter.id, { targetType: "post", targetId: p.id, reason: "hate" });
    const { action } = await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "hate" });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("removed");
    expect(await prisma.report.findFirst({ where: { targetId: p.id } })).toMatchObject({ status: "actioned", actionId: action.id });
    expect(await prisma.auditLog.findFirst({ where: { action: "moderation.remove", entityId: p.id } })).toMatchObject({ actorUserId: mod.id });
    const n = await prisma.notification.findFirstOrThrow({ where: { recipientId: author.id, type: "mod_removed" } });
    // The notice comes from ድንኳን, not from the moderator.
    expect(n).toMatchObject({ actorId: author.id, href: `/appeals/${action.id}` });
    expect(await moderationQueue()).toHaveLength(0);
  });

  it("F22-AC4: age-restrict, warn and dismiss", async () => {
    const [author, reporter, mod] = [await member(), await member(), await moderator()];
    const p = await post(author.id);
    await moderate(mod.id, { targetType: "post", targetId: p.id, action: "age_restrict", reason: "nudity" });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).ageRestricted).toBe(true);
    await expect(moderate(mod.id, { targetType: "profile", targetId: author.id, action: "age_restrict", reason: "nudity" })).rejects.toMatchObject({
      code: "MOD_ACTION_INVALID",
    });
    await moderate(mod.id, { targetType: "profile", targetId: author.id, action: "warn", reason: "harassment" });
    expect(await liveStrikes(prisma, author.id)).toBe(0);

    // A screened post a moderator finds clean goes public.
    const flagged = await post(author.id, "was flagged", "restricted");
    await flagContent(prisma, { targetType: "post", targetId: flagged.id, subjectId: author.id, category: "spam", severity: 1 });
    await fileReport(reporter.id, { targetType: "post", targetId: flagged.id, reason: "spam" }).catch(() => undefined);
    await moderate(mod.id, { targetType: "post", targetId: flagged.id, action: "dismiss", reason: "spam" });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: flagged.id } })).status).toBe("public");
    expect(await prisma.notification.count({ where: { recipientId: author.id } })).toBe(2); // age-restrict + warn
    expect(await prisma.auditLog.count({ where: { action: { startsWith: "moderation." } } })).toBe(3);
  });

  it("F22-AC4: only moderators can act, and not on reports about themselves", async () => {
    const [author, mod] = [await member(), await moderator()];
    const p = await post(author.id);
    await expect(moderate(author.id, { targetType: "post", targetId: p.id, action: "remove", reason: "spam" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const own = await post(mod.id);
    await expect(moderate(mod.id, { targetType: "post", targetId: own.id, action: "remove", reason: "spam" })).rejects.toMatchObject({
      code: "MOD_ACTION_INVALID",
    });
  });

  it("F22-AC4: removing a chat message or review hides it; the review leaves the rating", async () => {
    const [client, vendor, mod] = [await member("Client"), await member("Vendor"), await moderator()];
    const m = await chatMessage(client.id, vendor.id, client.id, "abusive");
    await moderate(mod.id, { targetType: "message", targetId: m.id, action: "remove", reason: "harassment" });
    expect((await prisma.message.findUniqueOrThrow({ where: { id: m.id } })).removedAt).not.toBeNull();

    const other = await member("Other");
    const mk = (clientId: string, stars: number) =>
      prisma.review.create({ data: { clientId, vendorId: vendor.id, stars, punctuality: stars, quality: stars, value: stars, communication: stars, body: "x" } });
    await mk(other.id, 5);
    const fake = await mk(client.id, 1);
    await moderate(mod.id, { targetType: "review", targetId: fake.id, action: "remove", reason: "scam" });
    expect(await prisma.vendorProfile.findUniqueOrThrow({ where: { userId: vendor.id } })).toMatchObject({ ratingAvg: 500, ratingCount: 1 });
  });

  it("F22-AC10: a copyright removal tells the uploader it was a takedown", async () => {
    const [author, owner, mod] = [await member(), await member("Rights holder"), await moderator()];
    const p = await post(author.id);
    await fileReport(owner.id, { targetType: "post", targetId: p.id, reason: "copyright", details: "This is my song, original on my channel" });
    const [item] = await moderationQueue();
    expect(item!.details[0]).toContain("my song");
    await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "copyright" });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("removed");
    expect(await prisma.notification.count({ where: { recipientId: author.id, type: "mod_takedown" } })).toBe(1);
  });
});

describe("F22-AC5 strikes, suspension and bans", () => {
  it("F22-AC5: 3 strikes in 90 days suspend the account for 7 days", async () => {
    const [author, mod] = [await member(), await moderator()];
    const now = new Date();
    for (let i = 0; i < 2; i++) {
      const p = await post(author.id, `p${i}`);
      const r = await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "spam" }, now);
      expect(r.escalated).toBeNull();
    }
    await assertActive(author.id, now);
    const p = await post(author.id, "third");
    const r = await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "spam" }, now);
    expect(r.escalated).toBe("suspended");
    const u = await prisma.user.findUniqueOrThrow({ where: { id: author.id } });
    expect(u.suspendedUntil!.getTime() - now.getTime()).toBe(7 * DAY);
    await expect(assertActive(author.id, now)).rejects.toMatchObject({ code: "ACCOUNT_SUSPENDED" });
    await assertActive(author.id, new Date(now.getTime() + 8 * DAY));
    expect(await prisma.notification.count({ where: { recipientId: author.id, type: "mod_suspended" } })).toBe(1);
  });

  it("F22-AC5: strikes older than 90 days don't count", async () => {
    const [author, mod] = [await member(), await moderator()];
    const long = new Date(Date.now() - 91 * DAY);
    for (let i = 0; i < 2; i++) {
      const p = await post(author.id, `old${i}`);
      await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "spam" }, long);
    }
    const p = await post(author.id, "new");
    const r = await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "spam" });
    expect(r.escalated).toBeNull();
    expect(await liveStrikes(prisma, author.id)).toBe(1);
  });

  it("F22-AC5: a severe violation bans at once and ends every session", async () => {
    const [author, mod] = [await member(), await moderator()];
    const token = await createSession(author.id);
    expect(await userForSession(token)).not.toBeNull();
    const p = await post(author.id);
    const r = await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "threat", severe: true });
    expect(r.escalated).toBe("banned");
    expect(await userForSession(token)).toBeNull();
    await expect(createSession(author.id)).rejects.toMatchObject({ code: "ACCOUNT_BANNED" });
    await expect(assertActive(author.id)).rejects.toMatchObject({ code: "ACCOUNT_BANNED" });
    expect(await prisma.strike.findFirstOrThrow({ where: { userId: author.id } })).toMatchObject({ severe: true });
  });

  it("F22-AC7: removing child sexual content is always severe", async () => {
    const [author, reporter, mod] = [await member(), await member(), await moderator()];
    const p = await post(author.id);
    await fileReport(reporter.id, { targetType: "post", targetId: p.id, reason: "child_safety" });
    const r = await moderate(mod.id, { targetType: "post", targetId: p.id, action: "remove", reason: "child_safety" });
    expect(r.escalated).toBe("banned");
  });
});

describe("F22-AC6 appeals", () => {
  it("F22-AC6: one appeal per decision, decided by a different moderator; overturning undoes it", async () => {
    const [author, modA, modB] = [await member(), await moderator("A"), await moderator("B")];
    const posts = await Promise.all([0, 1, 2].map((i) => post(author.id, `p${i}`)));
    let last = null;
    for (const p of posts) last = await moderate(modA.id, { targetType: "post", targetId: p.id, action: "remove", reason: "spam" });
    expect(last!.escalated).toBe("suspended");
    const actionId = last!.action.id;

    const d = await decisionFor(author.id, actionId);
    expect(d).toMatchObject({ action: "remove", reason: "spam", canAppeal: true });
    expect(d).not.toHaveProperty("moderatorId");
    await expect(decisionFor(modB.id, actionId)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const appeal = await fileAppeal(author.id, actionId, "This was a real event announcement, not spam.");
    await expect(fileAppeal(author.id, actionId, "Please look again at this decision.")).rejects.toMatchObject({ code: "ALREADY_APPEALED" });
    await expect(decideAppeal(modA.id, appeal.id, true)).rejects.toMatchObject({ code: "APPEAL_SAME_MODERATOR" });

    const decided = await decideAppeal(modB.id, appeal.id, true);
    expect(decided).toMatchObject({ status: "overturned", reviewerId: modB.id });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: posts[2]!.id } })).status).toBe("public");
    expect(await liveStrikes(prisma, author.id)).toBe(2);
    await assertActive(author.id); // the strike-triggered suspension is lifted
    expect(await prisma.notification.count({ where: { recipientId: author.id, type: "appeal_overturned" } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "moderation.appeal_overturn", entityId: appeal.id } })).toBe(1);
    await expect(decideAppeal(modB.id, appeal.id, false)).rejects.toMatchObject({ code: "MOD_ACTION_INVALID" });
  });

  it("F22-AC6: an upheld appeal leaves the decision in place", async () => {
    const [author, modA, modB] = [await member(), await moderator("A"), await moderator("B")];
    const p = await post(author.id);
    const { action } = await moderate(modA.id, { targetType: "post", targetId: p.id, action: "remove", reason: "hate" });
    const appeal = await fileAppeal(author.id, action.id, "I was quoting someone else to criticise them.");
    await decideAppeal(modB.id, appeal.id, false);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("removed");
    expect(await liveStrikes(prisma, author.id)).toBe(1);
    expect((await decisionFor(author.id, action.id)).canAppeal).toBe(false);
  });
});

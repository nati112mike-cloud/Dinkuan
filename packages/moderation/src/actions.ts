import { DomainError } from "@dinkuan/core";
import { audit } from "@dinkuan/core/server";
import { prisma, type ModAction, type NotificationType, type Prisma } from "@dinkuan/db";
import { z } from "zod";
import { REPORT_TARGETS, type ReportTarget } from "./reports";

type Tx = Prisma.TransactionClient;

export const STRIKE_WINDOW_MS = 90 * 24 * 3600_000;
export const STRIKES_TO_SUSPEND = 3;
export const STRIKE_SUSPENSION_DAYS = 7;

export const moderateInput = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1).max(64),
  action: z.enum(["remove", "age_restrict", "warn", "suspend", "ban", "dismiss"]),
  reason: z.string().trim().min(2).max(60),
  note: z.string().trim().max(500).optional(),
  /** F22-AC5: a severe violation bans the account at once. */
  severe: z.boolean().default(false),
  suspendDays: z.number().int().min(1).max(90).default(STRIKE_SUSPENSION_DAYS),
});
export type ModerateInput = z.input<typeof moderateInput>;

const NOTICE: Partial<Record<ModAction, NotificationType>> = {
  remove: "mod_removed",
  age_restrict: "mod_age_restricted",
  warn: "mod_warned",
  suspend: "mod_suspended",
  ban: "mod_banned",
};

/** Actions that count as a strike against the account (F22-AC5). A warning doesn't. */
const STRIKING: ModAction[] = ["remove", "suspend", "ban"];

export async function assertModerator(userId: string, db: Tx | typeof prisma = prisma) {
  const role = await db.userRole.findFirst({ where: { userId, role: "admin" } });
  if (!role) throw new DomainError("FORBIDDEN");
}

/**
 * System notices to the person a decision is about. The actor is the person themselves so
 * moderators are never named; the UI shows these as coming from ድንኳን.
 */
export async function notifySubject(tx: Tx, userId: string, type: NotificationType, href: string) {
  await tx.notification.create({ data: { recipientId: userId, actorId: userId, type, href } });
}

type TargetState = Prisma.InputJsonValue;

/** Applies the content side of an action and returns what it was before, for appeals. */
async function applyToContent(tx: Tx, type: ReportTarget, id: string, action: ModAction, restoreScreened: boolean): Promise<TargetState | null> {
  if (type === "post") {
    const p = await tx.post.findUniqueOrThrow({ where: { id } });
    const before = { status: p.status, ageRestricted: p.ageRestricted };
    if (action === "remove") await tx.post.update({ where: { id }, data: { status: "removed" } });
    if (action === "age_restrict") await tx.post.update({ where: { id }, data: { ageRestricted: true, status: p.status === "restricted" ? "public" : p.status } });
    // Screening can also remove outright (AC7); a moderator who finds it clean restores it.
    if (action === "dismiss" && restoreScreened && (p.status === "restricted" || p.status === "removed")) {
      await tx.post.update({ where: { id }, data: { status: "public" } });
    }
    return before;
  }
  if (action === "age_restrict") throw new DomainError("MOD_ACTION_INVALID", "Only posts can be age-restricted");
  if (type === "comment") {
    const c = await tx.comment.findUniqueOrThrow({ where: { id } });
    const before = { status: c.status };
    if (action === "remove" && c.status !== "removed") {
      await tx.comment.update({ where: { id }, data: { status: "removed" } });
      if (c.status === "visible") await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
    }
    if (action === "dismiss" && restoreScreened && (c.status === "hidden" || c.status === "removed")) {
      await tx.comment.update({ where: { id }, data: { status: "visible" } });
      await tx.post.update({ where: { id: c.postId }, data: { commentCount: { increment: 1 } } });
    }
    return before;
  }
  if (type === "profile") {
    const p = await tx.profile.findUnique({ where: { userId: id } });
    if (!p) return null;
    const before = { displayName: p.displayName, bio: p.bio, avatarUrl: p.avatarUrl, coverUrl: p.coverUrl, link: p.link };
    if (action === "remove") {
      await tx.profile.update({ where: { userId: id }, data: { displayName: p.username, bio: null, avatarUrl: null, coverUrl: null, link: null } });
    }
    return before;
  }
  if (type === "message") {
    if (action === "remove") await tx.message.update({ where: { id }, data: { removedAt: new Date() } });
    return { removed: false };
  }
  // review
  const r = await tx.review.findUniqueOrThrow({ where: { id } });
  if (action === "remove") {
    await tx.review.update({ where: { id }, data: { removedAt: new Date() } });
    await refreshVendorRating(tx, r.vendorId);
  }
  return { removed: false };
}

/** Who wrote the target, whatever state it is in now. */
async function subjectOf(tx: Tx, type: ReportTarget, id: string): Promise<string | null> {
  switch (type) {
    case "post":
      return (await tx.post.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null;
    case "comment":
      return (await tx.comment.findUnique({ where: { id }, select: { authorId: true } }))?.authorId ?? null;
    case "profile":
      return (await tx.user.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
    case "message":
      return (await tx.message.findUnique({ where: { id }, select: { senderId: true } }))?.senderId ?? null;
    case "review":
      return (await tx.review.findUnique({ where: { id }, select: { clientId: true } }))?.clientId ?? null;
  }
}

/** Keeps the denormalised rating in step when a review is removed or restored (CLAUDE.md rule 18). */
async function refreshVendorRating(tx: Tx, vendorId: string) {
  const agg = await tx.review.aggregate({ where: { vendorId, removedAt: null }, _avg: { stars: true }, _count: true });
  await tx.vendorProfile.update({
    where: { userId: vendorId },
    data: { ratingAvg: Math.round((agg._avg.stars ?? 0) * 100), ratingCount: agg._count },
  });
}

async function suspend(tx: Tx, userId: string, until: Date) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.suspendedUntil || u.suspendedUntil < until) await tx.user.update({ where: { id: userId }, data: { suspendedUntil: until } });
}

async function ban(tx: Tx, userId: string, now: Date) {
  await tx.user.update({ where: { id: userId }, data: { bannedAt: now } });
  // A ban signs the person out everywhere.
  await tx.session.deleteMany({ where: { userId } });
}

/** Strikes still counting: not revoked on appeal and inside the 90-day window. */
export async function liveStrikes(db: Tx | typeof prisma, userId: string, now = new Date()) {
  return db.strike.count({ where: { userId, revokedAt: null, createdAt: { gte: new Date(now.getTime() - STRIKE_WINDOW_MS) } } });
}

/**
 * F22-AC4/AC5: a moderator acts on reported or screened content. The action is recorded,
 * audit-logged, closes every open report on the target and tells the person it's about.
 * Strikes add up: three in 90 days suspend the account for 7 days; a severe one bans it.
 */
export async function moderate(moderatorId: string, raw: ModerateInput, now = new Date()) {
  const input = moderateInput.parse(raw);
  await assertModerator(moderatorId);
  return prisma.$transaction(async (tx) => {
    const subjectId = await subjectOf(tx, input.targetType, input.targetId);
    if (!subjectId) throw new DomainError("NOT_FOUND");
    if (subjectId === moderatorId) throw new DomainError("MOD_ACTION_INVALID", "Another moderator must handle reports about you");

    const open = await tx.report.findMany({ where: { targetType: input.targetType, targetId: input.targetId, status: "open" } });
    // Screening or a child-safety report hid it pending review; dismissing puts it back.
    const restoreScreened = open.some((r) => r.reporterId === null || r.reason === "child_safety");
    const severe = input.severe || (input.action === "remove" && open.some((r) => r.reason === "child_safety"));

    const before = await applyToContent(tx, input.targetType, input.targetId, input.action, restoreScreened);
    const action = await tx.moderationAction.create({
      data: {
        moderatorId,
        targetType: input.targetType,
        targetId: input.targetId,
        subjectId,
        action: input.action,
        reason: input.reason,
        note: input.note || null,
        before: before ?? undefined,
      },
    });

    let escalated: "suspended" | "banned" | null = null;
    if (input.action === "suspend") await suspend(tx, subjectId, new Date(now.getTime() + input.suspendDays * 86400_000));
    if (input.action === "ban" || severe) {
      await ban(tx, subjectId, now);
      if (input.action !== "ban") escalated = "banned";
    }
    if (STRIKING.includes(input.action) || severe) {
      await tx.strike.create({ data: { userId: subjectId, actionId: action.id, severe, createdAt: now } });
      if (!severe && input.action !== "ban" && (await liveStrikes(tx, subjectId, now)) >= STRIKES_TO_SUSPEND) {
        await suspend(tx, subjectId, new Date(now.getTime() + STRIKE_SUSPENSION_DAYS * 86400_000));
        escalated = "suspended";
      }
    }

    await tx.report.updateMany({
      where: { id: { in: open.map((r) => r.id) } },
      data: { status: input.action === "dismiss" ? "dismissed" : "actioned", actionId: action.id, resolvedAt: now },
    });
    await audit(
      {
        actorUserId: moderatorId,
        action: `moderation.${input.action}`,
        entity: input.targetType,
        entityId: input.targetId,
        before,
        after: { actionId: action.id, subjectId, reason: input.reason, severe, escalated, reports: open.length },
      },
      tx,
    );

    const href = `/appeals/${action.id}`;
    const copyright = input.action === "remove" && (input.reason === "copyright" || open.some((r) => r.reason === "copyright"));
    const notice = copyright ? "mod_takedown" : NOTICE[input.action];
    if (notice) await notifySubject(tx, subjectId, notice, href);
    if (escalated === "suspended") await notifySubject(tx, subjectId, "mod_suspended", href);
    if (escalated === "banned") await notifySubject(tx, subjectId, "mod_banned", href);
    return { action, escalated };
  });
}

export { refreshVendorRating };

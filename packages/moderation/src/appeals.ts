import { DomainError } from "@dinkuan/core";
import { audit } from "@dinkuan/core/server";
import { Prisma, prisma } from "@dinkuan/db";
import { z } from "zod";
import { assertModerator, liveStrikes, notifySubject, refreshVendorRating, STRIKE_WINDOW_MS, STRIKES_TO_SUSPEND } from "./actions";

type Tx = Prisma.TransactionClient;

export const APPEAL_MAX = 1000;

/** A decision about the person, with their appeal if they made one (for /appeals/[id]). */
export async function decisionFor(userId: string, actionId: string) {
  const action = await prisma.moderationAction.findUnique({ where: { id: actionId }, include: { appeal: true } });
  if (!action || action.subjectId !== userId) throw new DomainError("NOT_FOUND");
  const { moderatorId: _hidden, ...rest } = action;
  return { ...rest, canAppeal: action.action !== "dismiss" && !action.appeal && !action.overturnedAt };
}

/** F22-AC6: the person can appeal a decision once. */
export async function fileAppeal(userId: string, actionId: string, text: string) {
  const body = z.string().trim().min(10).max(APPEAL_MAX).parse(text);
  const action = await prisma.moderationAction.findUnique({ where: { id: actionId } });
  if (!action || action.subjectId !== userId) throw new DomainError("NOT_FOUND");
  if (action.action === "dismiss" || action.overturnedAt) throw new DomainError("MOD_ACTION_INVALID");
  try {
    return await prisma.appeal.create({ data: { actionId, userId, text: body } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError("ALREADY_APPEALED");
    throw e;
  }
}

/** Open appeals, oldest first. */
export async function appealQueue(take = 50) {
  return prisma.appeal.findMany({
    where: { status: "open" },
    orderBy: { createdAt: "asc" },
    take,
    include: { action: true, user: { select: { id: true, profile: { select: { username: true, displayName: true } } } } },
  });
}

async function restore(tx: Tx, a: { targetType: string; targetId: string; before: Prisma.JsonValue | null }) {
  const before = (a.before ?? {}) as Record<string, unknown>;
  switch (a.targetType) {
    case "post": {
      const status = (before.status as "public" | "restricted" | "removed" | undefined) ?? "public";
      await tx.post.update({
        where: { id: a.targetId },
        data: { status: status === "removed" ? "public" : status, ageRestricted: Boolean(before.ageRestricted) },
      });
      return;
    }
    case "comment": {
      const c = await tx.comment.findUniqueOrThrow({ where: { id: a.targetId } });
      const status = (before.status as "visible" | "hidden" | undefined) ?? "visible";
      if (c.status !== status) {
        await tx.comment.update({ where: { id: c.id }, data: { status } });
        if (status === "visible") await tx.post.update({ where: { id: c.postId }, data: { commentCount: { increment: 1 } } });
      }
      return;
    }
    case "profile":
      await tx.profile.update({
        where: { userId: a.targetId },
        data: {
          displayName: before.displayName as string,
          bio: (before.bio as string | null) ?? null,
          avatarUrl: (before.avatarUrl as string | null) ?? null,
          coverUrl: (before.coverUrl as string | null) ?? null,
          link: (before.link as string | null) ?? null,
        },
      });
      return;
    case "message":
      await tx.message.update({ where: { id: a.targetId }, data: { removedAt: null } });
      return;
    case "review": {
      const r = await tx.review.update({ where: { id: a.targetId }, data: { removedAt: null } });
      await refreshVendorRating(tx, r.vendorId);
      return;
    }
  }
}

/**
 * F22-AC6: a different moderator decides the appeal. Overturning restores the content,
 * revokes the strike and lifts any suspension or ban that came from it.
 */
export async function decideAppeal(reviewerId: string, appealId: string, overturn: boolean, note?: string, now = new Date()) {
  await assertModerator(reviewerId);
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId }, include: { action: { include: { strike: true } } } });
  if (!appeal) throw new DomainError("NOT_FOUND");
  if (appeal.action.moderatorId === reviewerId) throw new DomainError("APPEAL_SAME_MODERATOR");
  return prisma.$transaction(async (tx) => {
    // Only one decision wins.
    const claimed = await tx.appeal.updateMany({
      where: { id: appealId, status: "open" },
      data: { status: overturn ? "overturned" : "upheld", reviewerId, decidedAt: now },
    });
    if (claimed.count === 0) throw new DomainError("MOD_ACTION_INVALID", "This appeal was already decided");
    const a = appeal.action;
    const userId = appeal.userId;
    if (overturn) {
      await tx.moderationAction.update({ where: { id: a.id }, data: { overturnedAt: now } });
      if (a.action === "remove" || a.action === "age_restrict") await restore(tx, a);
      if (a.strike) await tx.strike.update({ where: { id: a.strike.id }, data: { revokedAt: now } });
      if (a.action === "ban" || a.strike?.severe) await tx.user.update({ where: { id: userId }, data: { bannedAt: null } });
      const otherSuspension = await tx.moderationAction.count({
        where: { subjectId: userId, action: "suspend", overturnedAt: null, createdAt: { gte: new Date(now.getTime() - STRIKE_WINDOW_MS) } },
      });
      if (a.action === "suspend" || (otherSuspension === 0 && (await liveStrikes(tx, userId, now)) < STRIKES_TO_SUSPEND)) {
        await tx.user.update({ where: { id: userId }, data: { suspendedUntil: null } });
      }
    }
    await audit(
      {
        actorUserId: reviewerId,
        action: overturn ? "moderation.appeal_overturn" : "moderation.appeal_uphold",
        entity: "appeal",
        entityId: appealId,
        after: { actionId: a.id, note: note?.slice(0, 500) ?? null },
      },
      tx,
    );
    await notifySubject(tx, userId, overturn ? "appeal_overturned" : "appeal_upheld", `/appeals/${a.id}`);
    return tx.appeal.findUniqueOrThrow({ where: { id: appealId } });
  });
}

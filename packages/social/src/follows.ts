import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";
import { assertUnderLimit } from "./limits";
import { notify } from "./notifications";
import { ensureProfile } from "./profiles";
import { isBlockedEitherWay } from "./visibility";

type Tx = Prisma.TransactionClient;

async function removeFollow(tx: Tx, followerId: string, followeeId: string) {
  const existing = await tx.follow.findUnique({ where: { followerId_followeeId: { followerId, followeeId } } });
  if (!existing) return;
  await tx.follow.delete({ where: { followerId_followeeId: { followerId, followeeId } } });
  if (existing.status === "active") {
    await tx.profile.update({ where: { userId: followerId }, data: { followingCount: { decrement: 1 } } });
    await tx.profile.update({ where: { userId: followeeId }, data: { followersCount: { decrement: 1 } } });
  }
}

/** F14-AC4: follow; private accounts get a request that the owner approves. */
export async function follow(viewerId: string, targetId: string): Promise<"active" | "requested"> {
  if (viewerId === targetId) throw new DomainError("VALIDATION", "You can't follow yourself");
  if (await isBlockedEitherWay(viewerId, targetId)) throw new DomainError("BLOCKED");
  await ensureProfile(viewerId);
  const target = await ensureProfile(targetId);
  const existing = await prisma.follow.findUnique({
    where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
  });
  if (existing) return existing.status;
  await assertUnderLimit("follows", viewerId);
  const status = target.isPrivate ? "requested" : "active";
  await prisma.$transaction(async (tx) => {
    await tx.follow.create({ data: { followerId: viewerId, followeeId: targetId, status } });
    if (status === "active") {
      await tx.profile.update({ where: { userId: viewerId }, data: { followingCount: { increment: 1 } } });
      await tx.profile.update({ where: { userId: targetId }, data: { followersCount: { increment: 1 } } });
    }
    await notify(tx, { recipientId: targetId, actorId: viewerId, type: status === "active" ? "follow" : "follow_request" });
  });
  return status;
}

export async function unfollow(viewerId: string, targetId: string) {
  await prisma.$transaction((tx) => removeFollow(tx, viewerId, targetId));
}

export async function approveFollowRequest(ownerId: string, requesterId: string) {
  await prisma.$transaction(async (tx) => {
    const req = await tx.follow.findUnique({
      where: { followerId_followeeId: { followerId: requesterId, followeeId: ownerId } },
    });
    if (!req || req.status !== "requested") throw new DomainError("NOT_FOUND");
    await tx.follow.update({
      where: { followerId_followeeId: { followerId: requesterId, followeeId: ownerId } },
      data: { status: "active" },
    });
    await tx.profile.update({ where: { userId: requesterId }, data: { followingCount: { increment: 1 } } });
    await tx.profile.update({ where: { userId: ownerId }, data: { followersCount: { increment: 1 } } });
    await notify(tx, { recipientId: requesterId, actorId: ownerId, type: "follow_accepted" });
  });
}

export async function declineFollowRequest(ownerId: string, requesterId: string) {
  await prisma.follow.deleteMany({ where: { followerId: requesterId, followeeId: ownerId, status: "requested" } });
}

export async function followRequests(ownerId: string) {
  const rows = await prisma.follow.findMany({
    where: { followeeId: ownerId, status: "requested" },
    orderBy: { createdAt: "desc" },
    include: { follower: { select: { profile: true } } },
  });
  return rows.map((r) => r.follower.profile).filter((p) => p !== null);
}

/** F14-AC5: block removes follows both ways; neither side can see or contact the other. */
export async function block(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw new DomainError("VALIDATION");
  await prisma.$transaction(async (tx) => {
    await tx.block.upsert({
      where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } },
      create: { blockerId: viewerId, blockedId: targetId },
      update: {},
    });
    await removeFollow(tx, viewerId, targetId);
    await removeFollow(tx, targetId, viewerId);
  });
}

export async function unblock(viewerId: string, targetId: string) {
  await prisma.block.deleteMany({ where: { blockerId: viewerId, blockedId: targetId } });
}

/** F14-AC5: mute hides their content from your feeds, silently. */
export async function mute(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw new DomainError("VALIDATION");
  await prisma.mute.upsert({
    where: { muterId_mutedId: { muterId: viewerId, mutedId: targetId } },
    create: { muterId: viewerId, mutedId: targetId },
    update: {},
  });
}

export async function unmute(viewerId: string, targetId: string) {
  await prisma.mute.deleteMany({ where: { muterId: viewerId, mutedId: targetId } });
}

export async function blockedList(viewerId: string) {
  const rows = await prisma.block.findMany({
    where: { blockerId: viewerId },
    include: { blocked: { select: { profile: true } } },
  });
  return rows.map((r) => r.blocked.profile).filter((p) => p !== null);
}

/** The viewer's follow state for each of `userIds` (for lists of people). */
export async function followStates(viewerId: string | null, userIds: string[]) {
  const map = new Map<string, "active" | "requested">();
  if (!viewerId || userIds.length === 0) return map;
  const rows = await prisma.follow.findMany({ where: { followerId: viewerId, followeeId: { in: userIds } } });
  for (const r of rows) map.set(r.followeeId, r.status);
  return map;
}

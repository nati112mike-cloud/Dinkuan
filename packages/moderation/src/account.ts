import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * F22-AC5: suspended and banned accounts can't post, comment, message or follow.
 * Called at the top of every write that puts content in front of other people.
 */
export async function assertActive(userId: string, now = new Date(), db: Db = prisma) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { bannedAt: true, suspendedUntil: true } });
  if (!u) throw new DomainError("NOT_FOUND");
  if (u.bannedAt) throw new DomainError("ACCOUNT_BANNED");
  if (u.suspendedUntil && u.suspendedUntil > now) throw new DomainError("ACCOUNT_SUSPENDED");
}

export function accountState(u: { bannedAt: Date | null; suspendedUntil: Date | null }, now = new Date()) {
  if (u.bannedAt) return "banned" as const;
  if (u.suspendedUntil && u.suspendedUntil > now) return "suspended" as const;
  return "active" as const;
}

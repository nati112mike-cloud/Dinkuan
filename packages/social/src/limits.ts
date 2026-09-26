import { DomainError } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";

/** F22-AC9: per-hour caps on posting, commenting, following and sharing to stop spam bots. */
export const LIMITS = { posts: 20, comments: 60, follows: 100, shares: 50 } as const;

export async function assertUnderLimit(kind: keyof typeof LIMITS, userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 3600_000);
  const count =
    kind === "posts"
      ? await prisma.post.count({ where: { authorId: userId, createdAt: { gte: since } } })
      : kind === "comments"
        ? await prisma.comment.count({ where: { authorId: userId, createdAt: { gte: since } } })
        : kind === "follows"
          ? await prisma.follow.count({ where: { followerId: userId, createdAt: { gte: since } } })
          : await prisma.share.count({ where: { userId, createdAt: { gte: since } } });
  if (count >= LIMITS[kind]) throw new DomainError("RATE_LIMITED");
}

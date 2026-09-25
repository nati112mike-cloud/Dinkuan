import { prisma, type Prisma } from "@dinkuan/db";

/**
 * CLAUDE.md rule 15: the one place that decides who can see which posts and people.
 * Every social query goes through these helpers.
 *
 * A post is visible to `viewer` when:
 * - it is public (screened), or it is the viewer's own and not removed;
 * - neither side has blocked the other;
 * - the author's account is public, or the viewer is the author or an accepted follower;
 * - the audience is public, or the viewer is the author or an accepted follower;
 * - in feeds only: the viewer has not muted the author.
 */
export function visiblePostsWhere(viewerId: string | null, opts: { feed?: boolean } = {}): Prisma.PostWhereInput {
  if (!viewerId) {
    return { status: "public", audience: "public", author: { profile: { isPrivate: false } } };
  }
  const followsAuthor: Prisma.PostWhereInput = {
    author: { followers: { some: { followerId: viewerId, status: "active" } } },
  };
  return {
    AND: [
      { OR: [{ status: "public" }, { authorId: viewerId, status: { not: "removed" } }] },
      { author: notBlockedWith(viewerId) },
      { OR: [{ author: { profile: { isPrivate: false } } }, { authorId: viewerId }, followsAuthor] },
      { OR: [{ audience: "public" }, { authorId: viewerId }, followsAuthor] },
      ...(opts.feed ? [{ author: { mutesReceived: { none: { muterId: viewerId } } } }] : []),
    ],
  };
}

/** People the viewer may see at all (blocks hide both sides from each other). */
export function visibleUsersWhere(viewerId: string | null): Prisma.UserWhereInput {
  return viewerId ? notBlockedWith(viewerId) : {};
}

function notBlockedWith(viewerId: string): Prisma.UserWhereInput {
  return {
    blocksMade: { none: { blockedId: viewerId } },
    blocksReceived: { none: { blockerId: viewerId } },
  };
}

export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const n = await prisma.block.count({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
  });
  return n > 0;
}

export async function canSeePost(postId: string, viewerId: string | null): Promise<boolean> {
  const n = await prisma.post.count({ where: { AND: [{ id: postId }, visiblePostsWhere(viewerId)] } });
  return n > 0;
}

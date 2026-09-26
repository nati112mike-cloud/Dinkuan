import { ADULT_CATEGORIES, ageGroup, type AgeGroup } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";

export type Viewer = { id: string; age: AgeGroup };

/** Looks up the viewer's age group (F22-AC8). Pass a Viewer you already have to skip the query. */
export async function resolveViewer(viewer: string | Viewer | null): Promise<Viewer | null> {
  if (!viewer) return null;
  if (typeof viewer !== "string") return viewer;
  const u = await prisma.user.findUnique({ where: { id: viewer }, select: { birthDate: true } });
  return { id: viewer, age: ageGroup(u?.birthDate) };
}

/**
 * CLAUDE.md rule 15: the one place that decides who can see which posts and people.
 * Every social query goes through these helpers.
 *
 * A post is visible to `viewer` when:
 * - it is public (screened), or it is the viewer's own and not removed;
 * - neither side has blocked the other;
 * - the author's account is public, or the viewer is the author or an accepted follower;
 * - the audience is public, or the viewer is the author or an accepted follower;
 * - in feeds only: the viewer has not muted the author;
 * - the author isn't banned (F22-AC5);
 * - age-restricted posts (F22-AC4) are for signed-in adults only (F22-AC8) and stay out of feeds;
 * - posts tagged to a nightlife event are hidden from teens (F22-AC8).
 */
export async function visiblePostsWhere(viewerOrId: string | Viewer | null, opts: { feed?: boolean } = {}): Promise<Prisma.PostWhereInput> {
  const viewer = await resolveViewer(viewerOrId);
  if (!viewer) {
    return { status: "public", audience: "public", ageRestricted: false, author: { bannedAt: null, profile: { isPrivate: false } } };
  }
  const viewerId = viewer.id;
  const own: Prisma.PostWhereInput = { authorId: viewerId };
  const followsAuthor: Prisma.PostWhereInput = {
    author: { followers: { some: { followerId: viewerId, status: "active" } } },
  };
  const ageRules: Prisma.PostWhereInput[] = [];
  if (opts.feed || viewer.age !== "adult") ageRules.push({ OR: [{ ageRestricted: false }, own] });
  if (viewer.age === "teen" || viewer.age === "child") {
    ageRules.push({ OR: [{ eventId: null }, { event: { category: { notIn: [...ADULT_CATEGORIES] } } }, own] });
  }
  return {
    AND: [
      { OR: [{ status: "public" }, { authorId: viewerId, status: { not: "removed" } }] },
      { author: { bannedAt: null, ...notBlockedWith(viewerId) } },
      { OR: [{ author: { profile: { isPrivate: false } } }, own, followsAuthor] },
      { OR: [{ audience: "public" }, own, followsAuthor] },
      ...(opts.feed ? [{ author: { mutesReceived: { none: { muterId: viewerId } } } }] : []),
      ...ageRules,
    ],
  };
}

/** People the viewer may see at all (blocks hide both sides from each other; banned accounts are gone). */
export function visibleUsersWhere(viewerId: string | null): Prisma.UserWhereInput {
  return viewerId ? { bannedAt: null, ...notBlockedWith(viewerId) } : { bannedAt: null };
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
  const n = await prisma.post.count({ where: { AND: [{ id: postId }, await visiblePostsWhere(viewerId)] } });
  return n > 0;
}

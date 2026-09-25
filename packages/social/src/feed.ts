import { prisma, type Prisma } from "@dinkuan/db";
import { decodeCursor, encodeCursor } from "./cursor";
import { pageByTime, postInclude, withViewerState, type PostRow, type PostView } from "./posts";
import { FOLLOW_BOOST, SAME_EVENT_BOOST } from "./text";
import { visiblePostsWhere } from "./visibility";

export type FeedPage = { items: PostView[]; nextCursor: string | null };
type RankCursor = { k: number; id: string };

/**
 * Keyset page over the stored rank key (CLAUDE.md rule 19: cursor pagination, no offsets).
 * The viewer's relationship boosts are applied inside the page, so paging never skips or repeats.
 */
async function rankedPage(where: Prisma.PostWhereInput, viewerId: string | null, cursor: string | null, take: number) {
  const c = decodeCursor<RankCursor>(cursor);
  const after: Prisma.PostWhereInput = c
    ? // The outer bound lets Postgres range-scan the rank index; the OR breaks ties by id.
      { rankKey: { lte: c.k }, OR: [{ rankKey: { lt: c.k } }, { id: { lt: c.id } }] }
    : {};
  const rows = await prisma.post.findMany({
    where: { AND: [where, after] },
    include: postInclude,
    orderBy: [{ rankKey: "desc" }, { id: "desc" }],
    take: take + 1,
  });
  const page = rows.slice(0, take);
  const last = page.at(-1);
  return { page, nextCursor: rows.length > take && last ? encodeCursor({ k: last.rankKey, id: last.id }) : null };
}

async function boostForViewer(posts: PostRow[], viewerId: string | null): Promise<PostRow[]> {
  if (!viewerId || posts.length === 0) return posts;
  const authorIds = [...new Set(posts.map((p) => p.authorId))];
  const eventIds = [...new Set(posts.map((p) => p.eventId).filter((e): e is string => !!e))];
  const [follows, tickets] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: viewerId, followeeId: { in: authorIds }, status: "active" }, select: { followeeId: true } }),
    eventIds.length
      ? prisma.ticket.findMany({ where: { holderUserId: viewerId, eventId: { in: eventIds } }, select: { eventId: true }, distinct: ["eventId"] })
      : Promise.resolve([]),
  ]);
  const followed = new Set(follows.map((f) => f.followeeId));
  const attended = new Set(tickets.map((t) => t.eventId));
  const boosted = (p: PostRow) =>
    p.rankKey +
    (followed.has(p.authorId) ? Math.log(FOLLOW_BOOST) : 0) +
    (p.eventId && attended.has(p.eventId) ? Math.log(SAME_EVENT_BOOST) : 0);
  return [...posts].sort((a, b) => boosted(b) - boosted(a));
}

/** F16-AC1/AC6: For You — popular Addis content, ranked. */
export async function forYouFeed(viewerId: string | null, cursor: string | null = null, take = 10): Promise<FeedPage> {
  const { page, nextCursor } = await rankedPage(visiblePostsWhere(viewerId, { feed: true }), viewerId, cursor, take);
  return { items: await withViewerState(await boostForViewer(page, viewerId), viewerId), nextCursor };
}

/** F16-AC1: Following — newest first from people you follow, plus your own posts. */
export async function followingFeed(viewerId: string, cursor: string | null = null, take = 10): Promise<FeedPage> {
  const where: Prisma.PostWhereInput = {
    AND: [
      visiblePostsWhere(viewerId, { feed: true }),
      { OR: [{ authorId: viewerId }, { author: { followers: { some: { followerId: viewerId, status: "active" } } } }] },
    ],
  };
  return pageByTime(where, viewerId, cursor, take);
}

/** F16-AC7: the reels player — ranked videos. `startId` opens the player on a given reel. */
export async function reelsFeed(viewerId: string | null, cursor: string | null = null, take = 6, startId?: string): Promise<FeedPage> {
  const where: Prisma.PostWhereInput = {
    AND: [visiblePostsWhere(viewerId, { feed: true }), { type: { in: ["video", "reel"] } }],
  };
  const { page, nextCursor } = await rankedPage(where, viewerId, cursor, take);
  let items = page;
  if (startId && !cursor) {
    const first = await prisma.post.findFirst({ where: { AND: [where, { id: startId }] }, include: postInclude });
    if (first) items = [first, ...page.filter((p) => p.id !== startId)];
  }
  return { items: await withViewerState(items, viewerId), nextCursor };
}

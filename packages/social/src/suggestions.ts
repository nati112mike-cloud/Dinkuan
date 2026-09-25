import { prisma, type Profile } from "@dinkuan/db";

export type SuggestionReason = "sameEvent" | "mutual" | "interest" | "popular";
export type Suggestion = { profile: Profile; reason: SuggestionReason; score: number };

/**
 * F17-AC1/AC3: people to follow, from people who went to the same events, mutual follows,
 * shared interests and who is popular in Addis. Each signal adds to a score; the strongest
 * signal becomes the reason shown on the card.
 */
export async function suggestPeople(viewerId: string, limit = 12): Promise<Suggestion[]> {
  const [following, blocks, myEvents, myInterests] = await Promise.all([
    prisma.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true, status: true } }),
    prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
    prisma.ticket.findMany({ where: { holderUserId: viewerId }, select: { eventId: true }, distinct: ["eventId"] }),
    prisma.userInterest.findMany({ where: { userId: viewerId }, select: { interestId: true } }),
  ]);
  const exclude = new Set<string>([viewerId, ...following.map((f) => f.followeeId)]);
  for (const b of blocks) exclude.add(b.blockerId === viewerId ? b.blockedId : b.blockerId);
  const activeFollowing = following.filter((f) => f.status === "active").map((f) => f.followeeId);

  const scores = new Map<string, { score: number; best: SuggestionReason; bestWeight: number }>();
  const add = (userId: string, reason: SuggestionReason, weight: number) => {
    if (exclude.has(userId)) return;
    const s = scores.get(userId) ?? { score: 0, best: reason, bestWeight: 0 };
    s.score += weight;
    if (weight > s.bestWeight) {
      s.best = reason;
      s.bestWeight = weight;
    }
    scores.set(userId, s);
  };

  const [sameEvent, mutual, sameInterest, popular] = await Promise.all([
    myEvents.length
      ? prisma.ticket.groupBy({
          by: ["holderUserId"],
          where: { eventId: { in: myEvents.map((e) => e.eventId) }, holderUserId: { not: viewerId } },
          _count: { eventId: true },
          orderBy: { _count: { eventId: "desc" } },
          take: 100,
        })
      : Promise.resolve([]),
    activeFollowing.length
      ? prisma.follow.groupBy({
          by: ["followeeId"],
          where: { followerId: { in: activeFollowing }, status: "active" },
          _count: { followerId: true },
          orderBy: { _count: { followerId: "desc" } },
          take: 100,
        })
      : Promise.resolve([]),
    myInterests.length
      ? prisma.userInterest.groupBy({
          by: ["userId"],
          where: { interestId: { in: myInterests.map((i) => i.interestId) }, userId: { not: viewerId } },
          _count: { interestId: true },
          orderBy: { _count: { interestId: "desc" } },
          take: 100,
        })
      : Promise.resolve([]),
    prisma.profile.findMany({ orderBy: { followersCount: "desc" }, take: 60, select: { userId: true, followersCount: true } }),
  ]);
  for (const r of sameEvent) add(r.holderUserId, "sameEvent", 3 * r._count.eventId);
  for (const r of mutual) add(r.followeeId, "mutual", 2 * r._count.followerId);
  for (const r of sameInterest) add(r.userId, "interest", 2 * r._count.interestId);
  for (const r of popular) add(r.userId, "popular", Math.log10(r.followersCount + 1));

  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, limit * 2);
  const profiles = await prisma.profile.findMany({ where: { userId: { in: ranked.map(([id]) => id) } } });
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  return ranked
    .map(([id, s]) => ({ profile: byId.get(id), reason: s.best, score: s.score }))
    .filter((s): s is Suggestion => !!s.profile)
    .slice(0, limit);
}

/** Popular public accounts, for people who aren't logged in yet. */
export async function popularPeople(limit = 20) {
  return prisma.profile.findMany({ where: { isPrivate: false }, orderBy: { followersCount: "desc" }, take: limit });
}

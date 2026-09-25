import { prisma, type AdPlacementKey, type Campaign, type Prisma } from "@dinkuan/db";
import { postInclude, visiblePostsWhere, visibleUsersWhere, withViewerState, type PostView } from "@dinkuan/social";
import { addisDay, FREQUENCY_CAP_PER_DAY } from "./text";

const dayDate = (now: Date) => new Date(`${addisDay(now)}T00:00:00.000Z`);

/** How many times each campaign was shown to this viewer today, across all placements. */
async function seenToday(viewerKey: string, campaignIds: string[], now: Date) {
  if (!campaignIds.length) return new Map<string, number>();
  const rows = await prisma.adImpression.groupBy({
    by: ["campaignId"],
    where: { viewerKey, day: dayDate(now), campaignId: { in: campaignIds } },
    _sum: { count: true },
  });
  return new Map(rows.map((r) => [r.campaignId, r._sum.count ?? 0]));
}

/** Total impressions each campaign has had today, for even pacing of impression packages (F21-AC4). */
async function shownToday(campaignIds: string[], now: Date) {
  if (!campaignIds.length) return new Map<string, number>();
  const rows = await prisma.adImpression.groupBy({
    by: ["campaignId"],
    where: { day: dayDate(now), campaignId: { in: campaignIds } },
    _sum: { count: true },
  });
  return new Map(rows.map((r) => [r.campaignId, r._sum.count ?? 0]));
}

/**
 * Picks the promotions to show in one placement: live, under the viewer's daily frequency cap
 * (F21-AC9) and, for impression packages, under today's even share of the goal (F21-AC4).
 * Campaigns with fewer impressions today go first, so slots rotate fairly.
 */
export async function eligibleCampaigns(
  placement: AdPlacementKey,
  viewerKey: string | null,
  opts: { now?: Date; where?: Prisma.CampaignWhereInput } = {},
): Promise<Campaign[]> {
  const now = opts.now ?? new Date();
  const live = await prisma.campaign.findMany({
    where: {
      status: "active",
      placements: { has: placement },
      startsAt: { lte: now },
      endsAt: { gt: now },
      ...opts.where,
    },
    take: 50,
  });
  const ids = live.map((c) => c.id);
  const [seen, today] = await Promise.all([viewerKey ? seenToday(viewerKey, ids, now) : new Map(), shownToday(ids, now)]);
  return live
    .filter((c) => (seen.get(c.id) ?? 0) < FREQUENCY_CAP_PER_DAY)
    .filter((c) => !c.impressionsGoal || (today.get(c.id) ?? 0) < Math.ceil(c.impressionsGoal / c.days))
    .sort((a, b) => (today.get(a.id) ?? 0) - (today.get(b.id) ?? 0) || a.id.localeCompare(b.id));
}

export type SponsoredPost = { campaignId: string; post: PostView };

/** Sponsored posts for the feed or reels. Visibility rules still apply (CLAUDE.md rule 15). */
export async function sponsoredPosts(
  placement: "feed" | "reels",
  viewerKey: string | null,
  viewerId: string | null,
  limit: number,
  now = new Date(),
): Promise<SponsoredPost[]> {
  const campaigns = await eligibleCampaigns(placement, viewerKey, { now, where: { targetType: "post" } });
  if (!campaigns.length || limit <= 0) return [];
  const posts = await prisma.post.findMany({
    where: {
      AND: [
        { id: { in: campaigns.map((c) => c.targetId) } },
        visiblePostsWhere(viewerId, { feed: true }),
        { audience: "public" },
        ...(placement === "reels" ? [{ type: { in: ["video" as const, "reel" as const] } }] : []),
      ],
    },
    include: postInclude,
  });
  const views = await withViewerState(posts, viewerId);
  const byId = new Map(views.map((p) => [p.id, p]));
  return campaigns
    .map((c) => ({ campaignId: c.id, post: byId.get(c.targetId) }))
    .filter((x): x is SponsoredPost => !!x.post)
    .slice(0, limit);
}

/** Sponsored events for Events featured, Home "This weekend" and the feed (event packages). */
export async function sponsoredEvents(
  placement: "events_featured" | "home_weekend" | "feed",
  viewerKey: string | null,
  limit: number,
  now = new Date(),
) {
  const campaigns = await eligibleCampaigns(placement, viewerKey, { now, where: { targetType: "event" } });
  if (!campaigns.length || limit <= 0) return [];
  const events = await prisma.event.findMany({
    where: { id: { in: campaigns.map((c) => c.targetId) }, status: "published", startsAt: { gt: now } },
    include: { venue: true, ticketTypes: { where: { visibility: "public" }, orderBy: { priceSantim: "asc" } } },
  });
  const byId = new Map(events.map((e) => [e.id, e]));
  return campaigns
    .map((c) => ({ campaignId: c.id, event: byId.get(c.targetId) }))
    .filter((x): x is { campaignId: string; event: NonNullable<typeof x.event> } => !!x.event)
    .slice(0, limit);
}

/**
 * "Vendor Top Search": vendors promoted for this type, in the order to pin them (F21-AC3).
 * Returns vendor ids and the campaign behind each, for impression tracking.
 */
export async function promotedVendors(type: string | undefined, viewerKey: string | null, viewerId: string | null, now = new Date()) {
  const campaigns = await eligibleCampaigns("search_top", viewerKey, { now, where: { targetType: { in: ["profile", "package"] } } });
  if (!campaigns.length) return [];
  const packageIds = campaigns.filter((c) => c.targetType === "package").map((c) => c.targetId);
  const packages = packageIds.length
    ? await prisma.package.findMany({ where: { id: { in: packageIds } }, select: { id: true, vendorId: true } })
    : [];
  const vendorOf = (c: Campaign) => (c.targetType === "profile" ? c.targetId : packages.find((p) => p.id === c.targetId)?.vendorId);
  const vendors = await prisma.vendorProfile.findMany({
    where: {
      userId: { in: campaigns.map(vendorOf).filter((v): v is string => !!v) },
      user: visibleUsersWhere(viewerId),
      ...(type ? { types: { has: type as never } } : {}),
    },
    select: { userId: true },
  });
  const ok = new Set(vendors.map((v) => v.userId));
  const seen = new Set<string>();
  const out: { vendorId: string; campaignId: string }[] = [];
  for (const c of campaigns) {
    const v = vendorOf(c);
    if (v && ok.has(v) && !seen.has(v)) {
      seen.add(v);
      out.push({ vendorId: v, campaignId: c.id });
    }
  }
  return out.slice(0, 3);
}

/**
 * Counts one impression. Ignored when the promotion isn't live in that placement, or the viewer
 * already hit today's cap (F21-AC9). The first impression for a viewer also counts towards reach.
 */
export async function recordImpression(campaignId: string, viewerKey: string, placement: AdPlacementKey, now = new Date()) {
  const day = dayDate(now);
  return prisma.$transaction(async (tx) => {
    const [c] = await tx.$queryRaw<{ status: string; placements: string[]; starts_at: Date | null; ends_at: Date | null }[]>`
      SELECT status, placements::text[] AS placements, starts_at, ends_at FROM campaigns WHERE id = ${campaignId}::uuid FOR UPDATE`;
    if (!c || c.status !== "active" || !c.placements.includes(placement)) return false;
    if (!c.starts_at || !c.ends_at || now < c.starts_at || now >= c.ends_at) return false;
    const today = await tx.adImpression.aggregate({ where: { campaignId, viewerKey, day }, _sum: { count: true } });
    if ((today._sum.count ?? 0) >= FREQUENCY_CAP_PER_DAY) return false;
    const firstEver = (await tx.adImpression.count({ where: { campaignId, viewerKey } })) === 0;
    await tx.adImpression.upsert({
      where: { campaignId_viewerKey_day_placement: { campaignId, viewerKey, day, placement } },
      create: { campaignId, viewerKey, day, placement },
      update: { count: { increment: 1 } },
    });
    await tx.campaign.update({
      where: { id: campaignId },
      data: { impressions: { increment: 1 }, ...(firstEver ? { reach: { increment: 1 } } : {}) },
    });
    return true;
  });
}

/** Where a promotion leads. Built from the campaign, never from the request (no open redirects). */
export async function campaignHref(c: Pick<Campaign, "targetType" | "targetId">): Promise<string> {
  switch (c.targetType) {
    case "event": {
      const e = await prisma.event.findUnique({ where: { id: c.targetId }, select: { slug: true } });
      return e ? `/e/${e.slug}` : "/events";
    }
    case "post":
      return `/p/${c.targetId}`;
    case "profile": {
      const p = await prisma.profile.findUnique({ where: { userId: c.targetId }, include: { user: { select: { vendorProfile: { select: { userId: true } } } } } });
      if (!p) return "/";
      return p.user.vendorProfile ? `/hire/v/${p.username}` : `/u/${p.username}`;
    }
    case "package": {
      const pkg = await prisma.package.findUnique({ where: { id: c.targetId }, include: { vendor: { include: { user: { select: { profile: true } } } } } });
      const username = pkg?.vendor.user.profile?.username;
      return username ? `/hire/v/${username}#packages` : "/hire";
    }
  }
}

/** Counts a click and returns where to send the viewer. */
export async function recordClick(campaignId: string, viewerKey: string, placement: AdPlacementKey) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) return null;
  if (c.status === "active" && c.placements.includes(placement)) {
    await prisma.$transaction([
      prisma.adClick.create({ data: { campaignId, viewerKey, placement } }),
      prisma.campaign.update({ where: { id: campaignId }, data: { clicks: { increment: 1 } } }),
    ]);
  }
  return { href: await campaignHref(c), countable: c.status === "active" };
}

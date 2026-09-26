/**
 * Demo promotion seed (runs after the marketplace seed): the F21 ready-made packages, placement
 * prices, and a few live promotions with results, so sponsored slots show up in the demo.
 * Safe to re-run: packages are upserted and the demo promotions are moved to run from today.
 */
import { appendLedger } from "@dinkuan/core/server";
import { prisma, type AdPlacementKey, type PromoTarget } from "@dinkuan/db";

const PACKAGES = [
  { key: "starter_boost", nameEn: "Starter Boost", nameAm: "መነሻ ማስታወቂያ", priceSantim: 30_000, days: 3, impressions: 3000, placements: ["feed", "reels"], targets: ["post"], sortOrder: 1 },
  { key: "event_spotlight", nameEn: "Event Spotlight", nameAm: "የዝግጅት ትኩረት", priceSantim: 150_000, days: 7, impressions: null, placements: ["events_featured", "feed"], targets: ["event"], sortOrder: 2 },
  // Reels boost and the Telegram channel post join when the bot ships (M4).
  { key: "weekend_takeover", nameEn: "Weekend Takeover", nameAm: "የሳምንት መጨረሻ ቁንጮ", priceSantim: 500_000, days: 3, impressions: null, placements: ["home_weekend", "events_featured"], targets: ["event"], sortOrder: 3 },
  { key: "vendor_top_search", nameEn: "Vendor Top Search", nameAm: "የፍለጋ አናት", priceSantim: 100_000, days: 30, impressions: null, placements: ["search_top"], targets: ["profile", "package"], sortOrder: 4 },
  // Shown as "coming soon" until push notifications exist.
  { key: "push_blast", nameEn: "Push Blast", nameAm: "የማሳወቂያ ማስታወቂያ", priceSantim: 300_000, days: 1, impressions: null, placements: ["push"], targets: ["event"], sortOrder: 5, active: false },
] satisfies {
  key: string;
  nameEn: string;
  nameAm: string;
  priceSantim: number;
  days: number;
  impressions: number | null;
  placements: AdPlacementKey[];
  targets: PromoTarget[];
  sortOrder: number;
  active?: boolean;
}[];

const PLACEMENTS: { key: AdPlacementKey; cpmSantim: number; minDailySantim: number }[] = [
  { key: "feed", cpmSantim: 10_000, minDailySantim: 5_000 },
  { key: "reels", cpmSantim: 12_000, minDailySantim: 5_000 },
  { key: "events_featured", cpmSantim: 15_000, minDailySantim: 20_000 },
  { key: "home_weekend", cpmSantim: 20_000, minDailySantim: 100_000 },
  { key: "search_top", cpmSantim: 15_000, minDailySantim: 3_000 },
  { key: "push", cpmSantim: 30_000, minDailySantim: 300_000 },
];

type Demo = {
  ref: string;
  packageKey: string;
  target: () => Promise<{ advertiserId: string; targetType: PromoTarget; targetId: string } | null>;
  stats: { impressions: number; reach: number; clicks: number };
};

const DEMOS: Demo[] = [
  {
    ref: "dkp_seed_spotlight",
    packageKey: "event_spotlight",
    target: async () => {
      const e = await prisma.event.findUnique({ where: { slug: "addis-jazz-weekend" }, include: { organiser: true } });
      return e && { advertiserId: e.organiser.ownerUserId, targetType: "event", targetId: e.id };
    },
    stats: { impressions: 2140, reach: 1310, clicks: 96 },
  },
  {
    ref: "dkp_seed_boost",
    packageKey: "starter_boost",
    target: async () => {
      const p = await prisma.post.findFirst({ where: { author: { profile: { username: "abel.laughs" } }, type: "reel" } });
      return p && { advertiserId: p.authorId, targetType: "post", targetId: p.id };
    },
    stats: { impressions: 870, reach: 610, clicks: 41 },
  },
  {
    ref: "dkp_seed_topsearch",
    packageKey: "vendor_top_search",
    target: async () => {
      const p = await prisma.profile.findUnique({ where: { username: "dj.mahi" } });
      return p && { advertiserId: p.userId, targetType: "profile", targetId: p.userId };
    },
    stats: { impressions: 460, reach: 380, clicks: 52 },
  },
];

async function main() {
  for (const p of PACKAGES) {
    await prisma.promoPackage.upsert({ where: { key: p.key }, create: p, update: p });
  }
  for (const p of PLACEMENTS) {
    await prisma.adPlacement.upsert({ where: { key: p.key }, create: p, update: p });
  }

  const now = Date.now();
  let seeded = 0;
  for (const d of DEMOS) {
    const pkg = PACKAGES.find((p) => p.key === d.packageKey)!;
    // Each demo promotion started yesterday, whenever the seed runs.
    const startsAt = new Date(now - 86400_000);
    const endsAt = new Date(startsAt.getTime() + pkg.days * 86400_000);
    const existing = await prisma.campaign.findUnique({ where: { gatewayRef: d.ref } });
    if (existing) {
      await prisma.campaign.update({ where: { id: existing.id }, data: { status: "active", startsAt, endsAt } });
      continue;
    }
    const target = await d.target();
    if (!target) continue;
    await prisma.$transaction(async (tx) => {
      const c = await tx.campaign.create({
        data: {
          ...target,
          packageKey: pkg.key,
          placements: pkg.placements,
          status: "active",
          budgetSantim: pkg.priceSantim,
          impressionsGoal: pkg.impressions,
          days: pkg.days,
          gateway: "telebirr",
          gatewayRef: d.ref,
          startsAt,
          endsAt,
          paidAt: new Date(startsAt.getTime() - 3600_000),
          reviewNote: "Demo promotion",
          ...d.stats,
        },
      });
      await appendLedger(tx, { organiserId: null, campaignId: c.id, type: "promotion", amount: c.budgetSantim, ref: c.gatewayRef });
    });
    seeded += 1;
  }
  console.log(`Seeded ${PACKAGES.length} promotion packages${seeded ? ` and ${seeded} demo promotions` : ""}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

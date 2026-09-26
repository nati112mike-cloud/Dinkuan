import { DomainError } from "@dinkuan/core";
import { audit, refundCampaign, startCampaignPayment, unspentSantim } from "@dinkuan/core/server";
import { prisma, type Campaign, type Gateway, type Prisma, type PromoTarget } from "@dinkuan/db";
import { notify, screenText } from "@dinkuan/social";
import { z } from "zod";
import { PROMO_TARGETS } from "./text";

/** F21-AC3: ready-made packages, cheapest first. Admin configures prices and availability. */
export function listPromoPackages(target?: PromoTarget) {
  return prisma.promoPackage.findMany({
    where: { active: true, ...(target ? { targets: { has: target } } : {}) },
    orderBy: [{ sortOrder: "asc" }, { priceSantim: "asc" }],
  });
}

export const buyInput = z.object({
  packageKey: z.string().min(1).max(40),
  targetType: z.enum(PROMO_TARGETS),
  targetId: z.uuid(),
  gateway: z.enum(["telebirr", "chapa"]).default("telebirr"),
});
export type BuyInput = z.input<typeof buyInput>;

/** What a promotion points at, with the text ad review screens and the owner allowed to promote it. */
async function resolveTarget(type: PromoTarget, id: string) {
  switch (type) {
    case "event": {
      const e = await prisma.event.findUnique({
        where: { id },
        include: { organiser: { include: { members: { where: { role: "manager" } } } } },
      });
      if (!e) return null;
      return {
        owners: [e.organiser.ownerUserId, ...e.organiser.members.map((m) => m.userId)],
        live: e.status === "published" && (e.endsAt ?? e.startsAt) > new Date(),
        text: [e.titleEn, e.titleAm, e.descEn, e.descAm].filter(Boolean).join("\n"),
        label: e.titleEn ?? e.titleAm ?? "Event",
      };
    }
    case "post": {
      const p = await prisma.post.findUnique({ where: { id } });
      if (!p) return null;
      return {
        owners: [p.authorId],
        live: p.status === "public" && p.audience === "public",
        text: p.caption,
        label: p.caption.slice(0, 60) || "Post",
      };
    }
    case "profile": {
      const p = await prisma.profile.findUnique({ where: { userId: id }, include: { user: { include: { vendorProfile: true } } } });
      if (!p) return null;
      return {
        owners: [p.userId],
        live: !p.isPrivate,
        text: [p.displayName, p.bio, p.user.vendorProfile?.headline].filter(Boolean).join("\n"),
        label: p.displayName || p.username,
        vendor: !!p.user.vendorProfile,
      };
    }
    case "package": {
      const pkg = await prisma.package.findUnique({ where: { id }, include: { vendor: true } });
      if (!pkg) return null;
      return {
        owners: [pkg.vendorId],
        live: pkg.active,
        text: [pkg.name, ...pkg.includes, pkg.vendor.headline].join("\n"),
        label: pkg.name,
        vendor: true,
      };
    }
  }
}

/**
 * F21-AC3: buy a ready-made package for something you own: your event (organiser owner or
 * manager), your post, your profile or your marketplace package (CLAUDE.md rule 7). Returns the
 * gateway checkout URL; the promotion goes to ad review once the payment is verified.
 */
export async function buyPromotion(buyerId: string, raw: BuyInput) {
  const input = buyInput.parse(raw);
  const pkg = await prisma.promoPackage.findUnique({ where: { key: input.packageKey } });
  if (!pkg || !pkg.active) throw new DomainError("NOT_FOUND", "Package not found");
  if (!pkg.targets.includes(input.targetType)) throw new DomainError("TARGET_NOT_ALLOWED");
  const target = await resolveTarget(input.targetType, input.targetId);
  if (!target) throw new DomainError("NOT_FOUND");
  if (!target.owners.includes(buyerId)) throw new DomainError("FORBIDDEN");
  if (!target.live) throw new DomainError("TARGET_NOT_ALLOWED", "Only public, live content can be promoted");
  // Vendor Top Search needs a pro profile to rank.
  if (pkg.placements.includes("search_top") && !("vendor" in target && target.vendor)) {
    throw new DomainError("TARGET_NOT_ALLOWED", "Set up a pro profile first");
  }
  return startCampaignPayment({
    advertiserId: buyerId,
    packageKey: pkg.key,
    targetType: input.targetType,
    targetId: input.targetId,
    placements: pkg.placements,
    budgetSantim: pkg.priceSantim,
    days: pkg.days,
    impressionsGoal: pkg.impressions,
    gateway: input.gateway as Gateway,
  });
}

/** F21-AC5: paid promotions waiting for ad review, oldest first, with an automated check. */
export async function adReviewQueue() {
  const rows = await prisma.campaign.findMany({
    where: { status: "pending_review" },
    orderBy: { paidAt: "asc" },
    include: { package: true, advertiser: { select: { profile: true } } },
  });
  return Promise.all(
    rows.map(async (c) => {
      const target = await resolveTarget(c.targetType, c.targetId);
      const screening = target ? screenText(target.text) : { status: "restricted" as const, reason: "missing" };
      return { campaign: c, targetLabel: target?.label ?? null, targetLive: !!target?.live, screening };
    }),
  );
}

/** Locks the campaign row and checks it is still in the status the caller decided on. */
async function claimStatus(tx: Prisma.TransactionClient, campaignId: string, expected: string) {
  const [row] = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM campaigns WHERE id = ${campaignId}::uuid FOR UPDATE`;
  if (!row || row.status !== expected) throw new DomainError("CAMPAIGN_STATE");
}

/**
 * F21-AC5: a moderator approves or rejects a paid promotion. Approval starts the run now;
 * rejection refunds the whole budget through the gateway (AC8). Every decision is audit-logged
 * (CLAUDE.md rule 11). Content that fails automated screening can't be approved.
 */
export async function reviewCampaign(adminId: string, campaignId: string, approve: boolean, note?: string, now = new Date()) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new DomainError("NOT_FOUND");
  if (c.status !== "pending_review") throw new DomainError("CAMPAIGN_STATE");
  const reviewNote = note?.trim().slice(0, 300) || null;
  if (approve) {
    const target = await resolveTarget(c.targetType, c.targetId);
    if (!target?.live || screenText(target.text).status !== "public") {
      throw new DomainError("TARGET_NOT_ALLOWED", "This content can't be promoted");
    }
    const updated = await prisma.$transaction(async (tx) => {
      // Only one decision wins: the status must still be what we read.
      await claimStatus(tx, campaignId, c.status);
      const u = await tx.campaign.update({
        where: { id: campaignId },
        data: {
          status: "active",
          startsAt: now,
          endsAt: new Date(now.getTime() + c.days * 86_400_000),
          reviewedBy: adminId,
          reviewNote,
        },
      });
      await audit({ actorUserId: adminId, action: "campaign.approve", entity: "campaign", entityId: campaignId, before: { status: c.status }, after: { status: "active" } }, tx);
      await notify(tx, { recipientId: c.advertiserId, actorId: adminId, type: "campaign_live", href: `/promote/c/${c.id}` });
      return u;
    });
    return updated;
  }
  await prisma.$transaction(async (tx) => {
    await claimStatus(tx, campaignId, c.status);
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "rejected", reviewedBy: adminId, reviewNote } });
    await audit({ actorUserId: adminId, action: "campaign.reject", entity: "campaign", entityId: campaignId, before: { status: c.status }, after: { status: "rejected", note: reviewNote } }, tx);
    await notify(tx, { recipientId: c.advertiserId, actorId: adminId, type: "campaign_rejected", href: `/promote/c/${c.id}` });
  });
  await refundCampaign(campaignId, c.budgetSantim, "Rejected in ad review", adminId);
  return prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
}

/**
 * F21-AC8: the advertiser stops a promotion early. The unspent share of the budget (time left,
 * since budget is spent evenly) goes back through the gateway. Before it starts, all of it does.
 */
export async function stopCampaign(userId: string, campaignId: string, now = new Date()): Promise<Campaign> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new DomainError("NOT_FOUND");
  if (c.advertiserId !== userId) throw new DomainError("FORBIDDEN");
  if (c.status !== "active" && c.status !== "pending_review") throw new DomainError("CAMPAIGN_STATE");
  const refund = unspentSantim(c, now);
  await prisma.$transaction(async (tx) => {
    // A double tap or a stop racing an ad rejection must not refund twice.
    await claimStatus(tx, campaignId, c.status);
    await tx.campaign.update({
      where: { id: campaignId },
      data: { status: c.status === "active" ? "ended" : "cancelled", endsAt: c.status === "active" ? now : c.endsAt },
    });
    await audit({ actorUserId: userId, action: "campaign.stop", entity: "campaign", entityId: campaignId, before: { status: c.status }, after: { refund } }, tx);
  });
  if (refund > 0) await refundCampaign(campaignId, refund, "Stopped early", userId);
  return prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
}

/** Ends promotions whose run is over (cron). */
export async function endFinishedCampaigns(now = new Date()) {
  const r = await prisma.campaign.updateMany({ where: { status: "active", endsAt: { lte: now } }, data: { status: "ended" } });
  return r.count;
}

export async function myCampaigns(userId: string) {
  return prisma.campaign.findMany({
    // Unpaid ones are listed too, so the advertiser can see a payment still being checked (audit R8).
    where: { advertiserId: userId },
    include: { package: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** F21-AC7: results for the advertiser (or an admin): impressions, reach, clicks, conversions. */
export async function campaignResults(viewer: { id: string; isAdmin: boolean }, campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { package: true } });
  if (!c) throw new DomainError("NOT_FOUND");
  if (c.advertiserId !== viewer.id && !viewer.isAdmin) throw new DomainError("FORBIDDEN");
  const [byType, daily, target] = await Promise.all([
    prisma.adConversion.groupBy({ by: ["type"], where: { campaignId }, _count: { _all: true } }),
    prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT day, sum(count)::bigint AS n FROM ad_impressions WHERE campaign_id = ${campaignId}::uuid GROUP BY day ORDER BY day`,
    resolveTarget(c.targetType, c.targetId),
  ]);
  const ctrBps = c.impressions ? Math.round((c.clicks * 10000) / c.impressions) : 0;
  return {
    campaign: c,
    targetLabel: target?.label ?? null,
    ctrBps,
    conversions: Object.fromEntries(byType.map((r) => [r.type, r._count._all])) as Partial<Record<"ticket_sale" | "booking_request" | "follow", number>>,
    daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), impressions: Number(d.n) })),
  };
}

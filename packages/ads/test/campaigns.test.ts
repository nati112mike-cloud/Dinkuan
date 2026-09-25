import { prisma } from "@dinkuan/db";
import { saveVendorProfile } from "@dinkuan/marketplace";
import { block, createPost } from "@dinkuan/social";
import { beforeEach, describe, expect, it } from "vitest";
import {
  adReviewQueue,
  buyPromotion,
  campaignResults,
  eligibleCampaigns,
  endFinishedCampaigns,
  estimatedReach,
  FREQUENCY_CAP_PER_DAY,
  listPromoPackages,
  promotedVendors,
  recordClick,
  recordImpression,
  reviewCampaign,
  sponsoredEvents,
  sponsoredPosts,
  SPONSORED_LABEL,
  stopCampaign,
} from "../src";
import { admin, member, ownedEvent, paidCampaign, resetDb } from "./helpers";

beforeEach(resetDb);

async function livePostCampaign() {
  const creator = await member("Creator");
  const post = await createPost(creator.id, { type: "text", caption: "New single out Friday 🎶" });
  const c = await paidCampaign(creator.id, { packageKey: "starter_boost", targetType: "post", targetId: post.id });
  const mod = await admin();
  await reviewCampaign(mod.id, c.id, true);
  return { creator, post, campaign: await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } }), mod };
}

describe("F21 promotion packages", () => {
  it("F21-AC3: ready-made packages are offered for what they can promote", async () => {
    expect((await listPromoPackages("event")).map((p) => p.key)).toEqual(["event_spotlight"]);
    expect((await listPromoPackages("post")).map((p) => p.key)).toEqual(["starter_boost"]);
    expect((await listPromoPackages()).length).toBe(3);
  });

  it("F21-AC2: an estimated reach is shown before paying", () => {
    const r = estimatedReach({ impressions: 3000, days: 3, placements: ["feed"] });
    expect(r).toEqual({ low: 1000, high: 2300 });
    const slot = estimatedReach({ impressions: null, days: 7, placements: ["events_featured"] });
    expect(slot.high).toBeGreaterThan(slot.low);
    const weekend = estimatedReach({ impressions: null, days: 3, placements: ["home_weekend"] });
    expect(weekend.high).toBeGreaterThan(weekend.low);
  });

  it("F21-AC3 / rule 7: you can only promote your own live content with a package made for it", async () => {
    const organiser = await member("Organiser");
    const event = await ownedEvent(organiser.id);
    const stranger = await member("Stranger");
    await expect(buyPromotion(stranger.id, { packageKey: "event_spotlight", targetType: "event", targetId: event.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(buyPromotion(organiser.id, { packageKey: "starter_boost", targetType: "event", targetId: event.id })).rejects.toMatchObject({ code: "TARGET_NOT_ALLOWED" });
    await expect(buyPromotion(organiser.id, { packageKey: "vendor_top_search", targetType: "profile", targetId: organiser.id })).rejects.toMatchObject({ code: "TARGET_NOT_ALLOWED" });
    const { campaign, checkoutUrl } = await buyPromotion(organiser.id, { packageKey: "event_spotlight", targetType: "event", targetId: event.id });
    expect(campaign).toMatchObject({ status: "pending_payment", budgetSantim: 150_000, days: 7, placements: ["events_featured", "feed"] });
    expect(checkoutUrl).toContain("/demo-pay/");
  });

  it("F21-AC5: paid promotions wait for ad review; approval starts the run and is audit-logged", async () => {
    const organiser = await member("Organiser");
    const event = await ownedEvent(organiser.id);
    const c = await paidCampaign(organiser.id, { packageKey: "event_spotlight", targetType: "event", targetId: event.id });
    expect(c.status).toBe("pending_review");
    expect(await sponsoredEvents("events_featured", "viewer", 3)).toEqual([]);
    const queue = await adReviewQueue();
    expect(queue).toMatchObject([{ campaign: { id: c.id }, targetLabel: "Rooftop Night", screening: { status: "public" } }]);
    const mod = await admin();
    const now = new Date();
    const live = await reviewCampaign(mod.id, c.id, true, undefined, now);
    expect(live.status).toBe("active");
    expect(live.endsAt!.getTime() - live.startsAt!.getTime()).toBe(7 * 86_400_000);
    expect(await prisma.auditLog.count({ where: { entityId: c.id, action: "campaign.approve", actorUserId: mod.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { recipientId: organiser.id, type: "campaign_live" } })).toBe(1);
    expect((await sponsoredEvents("events_featured", "viewer", 3)).map((s) => s.event.id)).toEqual([event.id]);
    await expect(reviewCampaign(mod.id, c.id, true)).rejects.toMatchObject({ code: "CAMPAIGN_STATE" });
  });

  it("F21-AC3: two promotions for the same event fill one slot", async () => {
    const organiser = await member("Organiser");
    const event = await ownedEvent(organiser.id);
    const mod = await admin();
    for (let i = 0; i < 2; i++) {
      const c = await paidCampaign(organiser.id, { packageKey: "event_spotlight", targetType: "event", targetId: event.id });
      await reviewCampaign(mod.id, c.id, true);
    }
    expect(await sponsoredEvents("events_featured", "viewer", 3)).toHaveLength(1);
  });

  it("F21-AC5/AC8: a rejected promotion is refunded in full through the gateway", async () => {
    const creator = await member("Creator");
    const post = await createPost(creator.id, { type: "text", caption: "Come to my show" });
    const c = await paidCampaign(creator.id, { packageKey: "starter_boost", targetType: "post", targetId: post.id });
    const mod = await admin();
    const rejected = await reviewCampaign(mod.id, c.id, false, "Misleading claim");
    expect(rejected).toMatchObject({ status: "rejected", refundedSantim: 30_000, reviewNote: "Misleading claim" });
    expect((await prisma.demoPayment.findUniqueOrThrow({ where: { ref: c.gatewayRef } })).refundedSantim).toBe(30_000);
    expect(await prisma.auditLog.count({ where: { entityId: c.id, action: { in: ["campaign.reject", "campaign.refund"] } } })).toBe(2);
  });

  it("F21-AC5: content that fails screening can't be approved", async () => {
    const creator = await member("Creator");
    const post = await createPost(creator.id, { type: "text", caption: "Great night!" });
    const c = await paidCampaign(creator.id, { packageKey: "starter_boost", targetType: "post", targetId: post.id });
    // Edited into spam after paying.
    await prisma.post.update({ where: { id: post.id }, data: { caption: "free money bit.ly/abc" } });
    expect((await adReviewQueue())[0]!.screening.status).toBe("restricted");
    const mod = await admin();
    await expect(reviewCampaign(mod.id, c.id, true)).rejects.toMatchObject({ code: "TARGET_NOT_ALLOWED" });
  });

  it("F21-AC6: the sponsored label reads in both languages", () => {
    expect(SPONSORED_LABEL).toBe("Sponsored · ማስታወቂያ");
  });

  it("F21-AC9: the same promotion is shown to the same person at most 3 times a day", async () => {
    const { campaign } = await livePostCampaign();
    for (let i = 0; i < FREQUENCY_CAP_PER_DAY; i++) {
      expect(await sponsoredPosts("feed", "viewer-1", null, 1)).toHaveLength(1);
      expect(await recordImpression(campaign.id, "viewer-1", i === 2 ? "reels" : "feed")).toBe(true);
    }
    expect(await sponsoredPosts("feed", "viewer-1", null, 1)).toEqual([]);
    expect(await sponsoredPosts("reels", "viewer-1", null, 1)).toEqual([]);
    expect(await recordImpression(campaign.id, "viewer-1", "feed")).toBe(false);
    // Someone else still sees it, and tomorrow the cap resets.
    expect(await sponsoredPosts("feed", "viewer-2", null, 1)).toHaveLength(1);
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(await eligibleCampaigns("feed", "viewer-1", { now: tomorrow })).toHaveLength(1);
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(c).toMatchObject({ impressions: 3, reach: 1 });
  });

  it("F21-AC4: impression packages are paced evenly across their days", async () => {
    const { campaign } = await livePostCampaign();
    // 3,000 impressions over 3 days → 1,000 a day.
    await prisma.adImpression.create({
      data: { campaignId: campaign.id, viewerKey: "crowd", day: new Date(`${new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)}T00:00:00Z`), placement: "feed", count: 1000 },
    });
    expect(await eligibleCampaigns("feed", "fresh-viewer")).toEqual([]);
  });

  it("rule 15: sponsored posts still respect blocks", async () => {
    const { creator } = await livePostCampaign();
    const viewer = await member("Viewer");
    await block(viewer.id, creator.id);
    expect(await sponsoredPosts("feed", viewer.id, viewer.id, 1)).toEqual([]);
  });

  it("F21-AC7: results count impressions, reach, clicks and conversions", async () => {
    const { campaign, creator } = await livePostCampaign();
    await recordImpression(campaign.id, "a", "feed");
    await recordImpression(campaign.id, "a", "feed");
    await recordImpression(campaign.id, "b", "reels");
    const click = await recordClick(campaign.id, "a", "feed");
    expect(click).toEqual({ href: `/p/${campaign.targetId}`, countable: true });
    const r = await campaignResults({ id: creator.id, isAdmin: false }, campaign.id);
    expect(r.campaign).toMatchObject({ impressions: 3, reach: 2, clicks: 1 });
    expect(r.ctrBps).toBe(3333);
    expect(r.daily).toHaveLength(1);
    const stranger = await member("Stranger");
    await expect(campaignResults({ id: stranger.id, isAdmin: false }, campaign.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await campaignResults({ id: stranger.id, isAdmin: true }, campaign.id)).campaign.id).toBe(campaign.id);
  });

  it("F21-AC8: stopping early refunds the unspent share; finished runs end on their own", async () => {
    const { campaign, creator } = await livePostCampaign();
    const halfway = new Date(campaign.startsAt!.getTime() + 1.5 * 86_400_000);
    const stopped = await stopCampaign(creator.id, campaign.id, halfway);
    expect(stopped).toMatchObject({ status: "ended", refundedSantim: 15_000 });
    await expect(stopCampaign(creator.id, campaign.id)).rejects.toMatchObject({ code: "CAMPAIGN_STATE" });

    const other = await livePostCampaign();
    expect(await endFinishedCampaigns(new Date(Date.now() + 4 * 86_400_000))).toBe(1);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: other.campaign.id } })).status).toBe("ended");
  });

  it("F21-AC3: Vendor Top Search pins the vendor for their type", async () => {
    const dj = await member("DJ");
    await saveVendorProfile(dj.id, { types: ["dj"], headline: "Wedding DJ" });
    const c = await paidCampaign(dj.id, { packageKey: "vendor_top_search", targetType: "profile", targetId: dj.id });
    await reviewCampaign((await admin()).id, c.id, true);
    expect(await promotedVendors("dj", "v", null)).toEqual([{ vendorId: dj.id, campaignId: c.id }]);
    expect(await promotedVendors("photographer", "v", null)).toEqual([]);
  });
});

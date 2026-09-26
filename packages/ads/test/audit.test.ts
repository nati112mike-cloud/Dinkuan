import { reconcilePendingCampaigns } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import { buyPromotion, myCampaigns, recordClick, reviewCampaign } from "../src";
import { admin, member, ownedEvent, paidCampaign, resetDb } from "./helpers";

beforeEach(resetDb);

describe("launch audit: promotions", () => {
  it("R8: the cron confirms promotions paid without a webhook and cancels ones left unpaid", async () => {
    const organiser = await member("Organiser");
    const event = await ownedEvent(organiser.id);
    const input = { packageKey: "event_spotlight", targetType: "event" as const, targetId: event.id };
    const paidQuietly = (await buyPromotion(organiser.id, input)).campaign;
    const abandoned = (await buyPromotion(organiser.id, input)).campaign;
    // The gateway took the money but the webhook never arrived.
    await prisma.demoPayment.update({ where: { ref: paidQuietly.gatewayRef }, data: { status: "paid" } });
    expect((await myCampaigns(organiser.id)).map((c) => c.status)).toEqual(["pending_payment", "pending_payment"]);

    const later = new Date(Date.now() + 2 * 3600_000);
    expect(await reconcilePendingCampaigns(later)).toMatchObject({ checked: 2, paid: 1, cancelled: 1 });
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: paidQuietly.id } })).status).toBe("pending_review");
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: abandoned.id } })).status).toBe("cancelled");
  });

  it("S16: a click counts once per person per day, and never for a visitor with no id yet", async () => {
    const organiser = await member("Organiser");
    const event = await ownedEvent(organiser.id);
    const c = await paidCampaign(organiser.id, { packageKey: "event_spotlight", targetType: "event", targetId: event.id });
    await reviewCampaign((await admin()).id, c.id, true);
    await recordClick(c.id, "v_1", "events_featured");
    await recordClick(c.id, "v_1", "events_featured");
    await recordClick(c.id, "v_new", "events_featured", { countable: false });
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.clicks).toBe(1);
  });
});

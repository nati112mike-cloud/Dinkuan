import { prisma } from "@dinkuan/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handlePaymentWebhook,
  markOrderPaid,
  refundCampaign,
  startCampaignPayment,
  startCheckout,
  unspentSantim,
  verifyCampaignWithGateway,
} from "../src/server";
import { gatewayMarksPaid, makeEvent, makeUser, resetDb, webhookFor } from "./helpers";

beforeEach(resetDb);

async function newCampaign(budget = 150_000) {
  const user = await makeUser("Advertiser");
  await prisma.promoPackage.create({
    data: { key: "event_spotlight", nameEn: "Event Spotlight", nameAm: "Event Spotlight", priceSantim: budget, days: 7, placements: ["events_featured", "feed"], targets: ["event"] },
  });
  const { event } = await makeEvent();
  return startCampaignPayment({
    advertiserId: user.id,
    packageKey: "event_spotlight",
    targetType: "event",
    targetId: event.id,
    placements: ["events_featured", "feed"],
    budgetSantim: budget,
    days: 7,
    impressionsGoal: null,
    gateway: "telebirr",
  });
}

describe("F21 promotion payments", () => {
  it("rule 2 / rule 13: a promotion is paid through the gateway and only a verified webhook marks it paid", async () => {
    const { campaign, checkoutUrl } = await newCampaign();
    expect(checkoutUrl).toContain(`/demo-pay/${campaign.gatewayRef}`);
    // Coming back from the payment page proves nothing on its own.
    expect((await verifyCampaignWithGateway(campaign.id)).status).toBe("pending_payment");

    await gatewayMarksPaid(campaign.gatewayRef);
    const w = webhookFor(campaign.gatewayRef, campaign.budgetSantim);
    expect(await handlePaymentWebhook("telebirr", w.body, w.headers)).toMatchObject({ status: "processed" });
    const paid = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(paid.status).toBe("pending_review");
    expect(paid.paidAt).not.toBeNull();

    // Duplicate deliveries are no-ops (rule 3) and the ledger has exactly one sale (rule 6).
    expect(await handlePaymentWebhook("telebirr", w.body, w.headers)).toMatchObject({ status: "duplicate" });
    const ledger = await prisma.ledgerEntry.findMany({ where: { campaignId: campaign.id } });
    expect(ledger).toMatchObject([{ type: "promotion", amountSantim: 150_000, organiserId: null }]);
    expect(await prisma.auditLog.count({ where: { entityId: campaign.id, action: "campaign.paid" } })).toBe(1);
  });

  it("rule 2: a webhook whose amount doesn't match what the gateway verifies is ignored", async () => {
    const { campaign } = await newCampaign();
    await gatewayMarksPaid(campaign.gatewayRef);
    await prisma.demoPayment.update({ where: { ref: campaign.gatewayRef }, data: { amountSantim: 100 } });
    const w = webhookFor(campaign.gatewayRef, 100);
    await handlePaymentWebhook("telebirr", w.body, w.headers);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("pending_payment");
  });

  it("F21-AC4: budget is spent evenly, so the unspent part is the share of time left", () => {
    const startsAt = new Date("2026-10-01T00:00:00Z");
    const endsAt = new Date("2026-10-08T00:00:00Z");
    const c = { budgetSantim: 150_000, refundedSantim: 0, startsAt, endsAt };
    expect(unspentSantim(c, new Date("2026-09-30T00:00:00Z"))).toBe(150_000);
    expect(unspentSantim({ ...c, startsAt: null, endsAt: null })).toBe(150_000);
    expect(unspentSantim(c, new Date("2026-10-04T12:00:00Z"))).toBe(75_000);
    expect(unspentSantim(c, new Date("2026-10-02T00:00:00Z"))).toBe(128_571);
    expect(unspentSantim(c, endsAt)).toBe(0);
    expect(unspentSantim({ ...c, refundedSantim: 140_000 }, startsAt)).toBe(10_000);
  });

  it("F21-AC8: refunds go back through the gateway and are booked in the ledger", async () => {
    const { campaign } = await newCampaign();
    await gatewayMarksPaid(campaign.gatewayRef);
    await verifyCampaignWithGateway(campaign.id);
    expect(await refundCampaign(campaign.id, 50_000, "Stopped early", null)).toBe(50_000);
    // Never more than what's left.
    expect(await refundCampaign(campaign.id, 999_999, "Rejected", null)).toBe(100_000);
    expect(await refundCampaign(campaign.id, 1, "Again", null)).toBe(0);
    expect((await prisma.demoPayment.findUniqueOrThrow({ where: { ref: campaign.gatewayRef } })).refundedSantim).toBe(150_000);
    const rows = await prisma.ledgerEntry.findMany({ where: { campaignId: campaign.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.type, r.amountSantim])).toEqual([
      ["promotion", 150_000],
      ["promotion_refund", -50_000],
      ["promotion_refund", -100_000],
    ]);
    expect(rows.at(-1)!.balanceAfterSantim).toBe(0);
  });

  it("F21-AC7: a ticket bought after clicking a live promotion counts as its conversion, once", async () => {
    const { campaign } = await newCampaign();
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "active", startsAt: new Date(), endsAt: new Date(Date.now() + 86400_000) } });
    const { event, ticketType } = await makeEvent();
    const buyer = await makeUser("Buyer");
    const { order } = await startCheckout({
      userId: buyer.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 1 }],
      gateway: "telebirr",
      campaignId: campaign.id,
    });
    expect(order.campaignId).toBe(campaign.id);
    await markOrderPaid(order.id, { source: "verify" });
    await markOrderPaid(order.id, { source: "verify" });
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).conversions).toBe(1);
    expect(await prisma.adConversion.findMany({ where: { campaignId: campaign.id } })).toMatchObject([{ type: "ticket_sale", refId: order.id }]);

    // A made-up or never-live campaign id in the cookie is ignored.
    const other = await makeUser("Other");
    const { order: o2 } = await startCheckout({
      userId: other.id,
      eventId: event.id,
      items: [{ ticketTypeId: ticketType.id, qty: 1 }],
      gateway: "telebirr",
      campaignId: "not-a-uuid",
    });
    expect(o2.campaignId).toBeNull();
  });
});

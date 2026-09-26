import { handlePaymentWebhook } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { signDemoWebhook } from "@dinkuan/payments";
import { ensureProfile } from "@dinkuan/social";
import { buyPromotion, type BuyInput } from "../src";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await prisma.promoPackage.createMany({
    data: [
      { key: "starter_boost", nameEn: "Starter Boost", nameAm: "Starter Boost", priceSantim: 30_000, days: 3, impressions: 3000, placements: ["feed", "reels"], targets: ["post"], sortOrder: 1 },
      { key: "event_spotlight", nameEn: "Event Spotlight", nameAm: "Event Spotlight", priceSantim: 150_000, days: 7, placements: ["events_featured", "feed"], targets: ["event"], sortOrder: 2 },
      { key: "vendor_top_search", nameEn: "Vendor Top Search", nameAm: "Vendor Top Search", priceSantim: 100_000, days: 30, placements: ["search_top"], targets: ["profile", "package"], sortOrder: 4 },
    ],
  });
}

let n = 0;
export async function member(name = "Member") {
  n += 1;
  const user = await prisma.user.create({
    data: { phone: `+2519${String(40000000 + n).slice(-8)}`, name, birthDate: new Date("1995-05-05T00:00:00Z"), roles: { create: { role: "buyer" } } },
  });
  await ensureProfile(user.id);
  return user;
}

export async function admin() {
  const u = await member("Admin");
  await prisma.userRole.create({ data: { userId: u.id, role: "admin" } });
  return u;
}

export async function ownedEvent(ownerId: string, title = "Rooftop Night") {
  const organiser = await prisma.organiser.create({ data: { ownerUserId: ownerId, name: "Org", type: "business", status: "approved" } });
  const venue = await prisma.venue.create({ data: { name: "Bole Rooftop", address: "Addis", lat: 9, lng: 38.7 } });
  return prisma.event.create({
    data: {
      organiserId: organiser.id,
      slug: `ev-${Math.random().toString(36).slice(2, 9)}`,
      titleEn: title,
      category: "nightlife",
      posterUrl: "/p.png",
      venueId: venue.id,
      startsAt: new Date(Date.now() + 5 * 86400_000),
      status: "published",
      ticketTypes: { create: { name: "Regular", priceSantim: 50_000, capacity: 100 } },
    },
    include: { ticketTypes: true },
  });
}

/** The buyer pays on the (demo) gateway, which then sends its signed webhook. */
export async function pay(ref: string) {
  const p = await prisma.demoPayment.update({ where: { ref }, data: { status: "paid" } });
  const body = JSON.stringify({ ref, event: "payment.succeeded", amount_santim: p.amountSantim });
  await handlePaymentWebhook(p.gateway, body, { "x-demo-signature": signDemoWebhook(body, process.env.PAYMENT_WEBHOOK_SECRET!) });
}

/** Buys and pays for a promotion; it is then waiting for ad review. */
export async function paidCampaign(buyerId: string, input: BuyInput) {
  const { campaign } = await buyPromotion(buyerId, input);
  await pay(campaign.gatewayRef);
  return prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
}

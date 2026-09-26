import { prisma } from "@dinkuan/db";
import { signDemoWebhook } from "@dinkuan/payments";

export async function resetDb() {
  // ledger_entries blocks DELETE via trigger, so TRUNCATE (not covered by row triggers) everything.
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let phoneCounter = 0;
/** A signed-up buyer, an adult unless `birthDate` says otherwise (null = joined before it was asked). */
export async function makeUser(name = "Test Buyer", birthDate: Date | null = new Date("1995-05-05T00:00:00Z")) {
  phoneCounter += 1;
  const phone = `+2519${String(10000000 + phoneCounter).slice(-8)}`;
  return prisma.user.create({ data: { phone, name, birthDate, roles: { create: { role: "buyer" } } } });
}

export async function makeEvent(opts: { capacity?: number; price?: number; startsInHours?: number } = {}) {
  const owner = await makeUser("Organiser");
  const organiser = await prisma.organiser.create({
    data: { ownerUserId: owner.id, name: "Test Org", type: "business", status: "approved" },
  });
  const venue = await prisma.venue.create({ data: { name: "Test Hall", address: "Addis Ababa", lat: 9.0, lng: 38.7 } });
  const event = await prisma.event.create({
    data: {
      organiserId: organiser.id,
      slug: `ev-${Math.random().toString(36).slice(2, 10)}`,
      titleEn: "Test Night",
      category: "nightlife",
      posterUrl: "/p.png",
      venueId: venue.id,
      startsAt: new Date(Date.now() + (opts.startsInHours ?? 48) * 3600_000),
      status: "published",
      ticketTypes: {
        create: { name: "Regular", priceSantim: opts.price ?? 50000, capacity: opts.capacity ?? 100 },
      },
    },
    include: { ticketTypes: true },
  });
  return { event, ticketType: event.ticketTypes[0]!, organiser, owner };
}

export function webhookFor(ref: string, amount: number, event: "payment.succeeded" | "payment.failed" = "payment.succeeded") {
  const body = JSON.stringify({ ref, event, amount_santim: amount });
  return { body, headers: { "x-demo-signature": signDemoWebhook(body, process.env.PAYMENT_WEBHOOK_SECRET!) } };
}

/** What the demo payment page does when the buyer confirms: gateway-side state becomes paid. */
export async function gatewayMarksPaid(ref: string) {
  await prisma.demoPayment.update({ where: { ref }, data: { status: "paid" } });
}

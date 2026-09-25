import { prisma } from "@dinkuan/db";
import { ensureProfile, startUpload, appendChunk, updateProfile } from "../src";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
/** A member with a profile. */
export async function member(name = "Member", opts: { private?: boolean; username?: string } = {}) {
  n += 1;
  const user = await prisma.user.create({
    data: { phone: `+2519${String(20000000 + n).slice(-8)}`, name, roles: { create: { role: "buyer" } } },
  });
  await ensureProfile(user.id);
  if (opts.private || opts.username) {
    await updateProfile(user.id, { isPrivate: opts.private, username: opts.username });
  }
  return user;
}

/** A finished upload of `bytes` bytes of the given type. */
export async function uploaded(userId: string, contentType = "image/jpeg", bytes = 1000) {
  const up = await startUpload(userId, { contentType, size: bytes });
  await appendChunk(userId, up.id, 0, new Uint8Array(bytes).fill(7));
  return up.id;
}

export async function makeEvent() {
  const owner = await member("Organiser");
  const organiser = await prisma.organiser.create({
    data: { ownerUserId: owner.id, name: "Org", type: "business", status: "approved" },
  });
  const venue = await prisma.venue.create({ data: { name: "Hall", address: "Addis", lat: 9, lng: 38.7 } });
  return prisma.event.create({
    data: {
      organiserId: organiser.id,
      slug: `ev-${Math.random().toString(36).slice(2, 9)}`,
      titleEn: "Night",
      category: "nightlife",
      posterUrl: "/p.png",
      venueId: venue.id,
      startsAt: new Date(Date.now() + 86400_000),
      status: "published",
      ticketTypes: { create: { name: "Regular", priceSantim: 10000, capacity: 100 } },
    },
    include: { ticketTypes: true },
  });
}

/** Gives `userId` a valid ticket to the event without going through checkout. */
export async function giveTicket(userId: string, event: Awaited<ReturnType<typeof makeEvent>>) {
  const order = await prisma.order.create({
    data: {
      userId,
      eventId: event.id,
      status: "paid",
      subtotalSantim: 10000,
      feeSantim: 0,
      totalSantim: 10000,
      gateway: "telebirr",
      gatewayRef: `ref-${Math.random()}`,
      expiresAt: new Date(),
      holdsReservation: false,
    },
  });
  return prisma.ticket.create({
    data: { orderId: order.id, ticketTypeId: event.ticketTypes[0]!.id, eventId: event.id, holderUserId: userId, holderName: "X" },
  });
}

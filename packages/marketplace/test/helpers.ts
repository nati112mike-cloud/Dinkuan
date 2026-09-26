import { prisma } from "@dinkuan/db";
import { appendChunk, ensureProfile, startUpload, updateProfile } from "@dinkuan/social";
import { saveVendorProfile, savePackages, type VendorInput } from "../src";

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function member(name = "Member", opts: { username?: string } = {}) {
  n += 1;
  const user = await prisma.user.create({
    data: { phone: `+2519${String(30000000 + n).slice(-8)}`, name, roles: { create: { role: "buyer" } } },
  });
  await ensureProfile(user.id);
  if (opts.username) await updateProfile(user.id, { username: opts.username });
  return user;
}

export async function vendor(name: string, input: Partial<VendorInput> = {}, priceBirr = 10_000) {
  const user = await member(name);
  await saveVendorProfile(user.id, { types: ["dj"], headline: `${name} · DJ`, ...input });
  await savePackages(user.id, [
    { tier: "basic", name: "Basic", priceSantim: priceBirr * 100, hours: 4, includes: ["DJ set"] },
  ]);
  return user;
}

export async function uploaded(userId: string, contentType = "image/jpeg", bytes = 1000) {
  const up = await startUpload(userId, { contentType, size: bytes });
  await appendChunk(userId, up.id, 0, new Uint8Array(bytes).fill(7));
  return up.id;
}

export async function makeEvent(ownerId?: string) {
  const owner = ownerId ?? (await member("Organiser")).id;
  const organiser = await prisma.organiser.create({
    data: { ownerUserId: owner, name: "Org", type: "business", status: "approved" },
  });
  const venue = await prisma.venue.create({ data: { name: "Hilton", address: "Addis", lat: 9, lng: 38.7 } });
  return prisma.event.create({
    data: {
      organiserId: organiser.id,
      slug: `ev-${Math.random().toString(36).slice(2, 9)}`,
      titleEn: "Wedding Expo",
      category: "community",
      posterUrl: "/p.png",
      venueId: venue.id,
      startsAt: new Date(Date.now() - 86400_000),
      status: "published",
    },
  });
}

/** A calendar date `days` from now, as YYYY-MM-DD. */
export const inDays = (days: number) => new Date(Date.now() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

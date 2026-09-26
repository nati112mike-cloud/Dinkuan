import { DomainError } from "@dinkuan/core";
import { assertAdult } from "@dinkuan/core/server";
import { prisma, type Prisma, type VendorProfile } from "@dinkuan/db";
import { ensureProfile, visibleUsersWhere } from "@dinkuan/social";
import { z } from "zod";
import { levelFor, qualityScore, VENDOR_TYPES } from "./text";

type Db = Prisma.TransactionClient | typeof prisma;

const list = (max: number, len = 40) => z.array(z.string().trim().min(1).max(len)).max(max).default([]);

/** F20-AC1: everything a pro profile adds on top of the social profile (F14). */
export const vendorInput = z.object({
  types: z.array(z.enum(VENDOR_TYPES)).min(1).max(3),
  headline: z.string().trim().min(3).max(80),
  about: z.string().trim().max(1000).optional(),
  yearsExperience: z.number().int().min(0).max(60).default(0),
  services: list(12),
  genres: list(12),
  languages: list(6),
  areas: list(11),
  equipment: list(20, 80),
  teamSize: z.number().int().min(1).max(200).default(1),
  socialLinks: z.array(z.url().max(200)).max(5).default([]),
  coverUrl: z.string().max(300).nullable().optional(),
});
export type VendorInput = z.input<typeof vendorInput>;

/**
 * Turns a member into a vendor (or updates their pro profile). New pro profiles are for adults
 * only: clients message vendors directly, and teens get no messages from adults they don't know
 * (F22-AC8).
 */
export async function saveVendorProfile(userId: string, raw: VendorInput): Promise<VendorProfile> {
  const input = vendorInput.parse(raw);
  if (!(await getVendor(userId))) await assertAdult(prisma, userId);
  await ensureProfile(userId);
  const data = { ...input, about: input.about ?? null, coverUrl: input.coverUrl ?? null };
  const v = await prisma.vendorProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await refreshVendorStats(prisma, userId);
  return prisma.vendorProfile.findUniqueOrThrow({ where: { userId: v.userId } });
}

export async function getVendor(userId: string) {
  return prisma.vendorProfile.findUnique({ where: { userId } });
}

export async function assertVendor(userId: string): Promise<VendorProfile> {
  const v = await getVendor(userId);
  if (!v) throw new DomainError("FORBIDDEN", "Set up your pro profile first");
  return v;
}

/**
 * Recomputes the denormalised numbers a vendor card shows: starting price (AC4), response
 * rate and level (AC7), and the recommended-sort quality score (AC10).
 */
export async function refreshVendorStats(db: Db, vendorId: string) {
  const v = await db.vendorProfile.findUnique({ where: { userId: vendorId } });
  if (!v) return;
  const [cheapest, verifiedGigs, cancellations] = await Promise.all([
    db.package.findFirst({ where: { vendorId, active: true }, orderBy: { priceSantim: "asc" } }),
    db.portfolioAlbum.count({ where: { vendorId, gigStatus: "verified" } }),
    db.bookingRequest.count({ where: { vendorId, status: "cancelled" } }),
  ]);
  const responseRateBps = v.requestsCount ? Math.floor((v.repliedCount * 10000) / v.requestsCount) : 10000;
  await db.vendorProfile.update({
    where: { userId: vendorId },
    data: {
      startingPriceSantim: cheapest?.priceSantim ?? null,
      level: levelFor({
        completedBookings: v.bookingsCount,
        ratingAvg: v.ratingAvg,
        ratingCount: v.ratingCount,
        responseRateBps,
        cancellations,
      }),
      qualityScore: qualityScore({
        ratingAvg: v.ratingAvg,
        ratingCount: v.ratingCount,
        bookingsCount: v.bookingsCount,
        responseRateBps,
        verifiedGigs,
      }),
    },
  });
}

/** Everything the pro profile page shows (F20-AC1–AC6). Hidden from people the vendor blocked. */
export async function getVendorPage(username: string, viewerId: string | null) {
  const profile = await prisma.profile.findFirst({
    where: { username: username.toLowerCase(), user: visibleUsersWhere(viewerId), NOT: { user: { vendorProfile: null } } },
  });
  if (!profile) return null;
  const vendor = await prisma.vendorProfile.findUniqueOrThrow({
    where: { userId: profile.userId },
    include: {
      packages: { where: { active: true }, include: { addons: true }, orderBy: { priceSantim: "asc" } },
      albums: {
        orderBy: { createdAt: "desc" },
        include: {
          items: { orderBy: { orderIdx: "asc" } },
          event: { select: { slug: true, titleEn: true, titleAm: true, startsAt: true, venue: { select: { name: true } } } },
        },
      },
      credits: { orderBy: [{ verified: "desc" }, { date: "desc" }] },
    },
  });
  const verifiedGigs = vendor.albums.filter((a) => a.gigStatus === "verified").length;
  return { profile, vendor, verifiedGigs };
}

export type VendorPage = NonNullable<Awaited<ReturnType<typeof getVendorPage>>>;

export async function getVendorByUsername(username: string) {
  const profile = await prisma.profile.findUnique({ where: { username: username.toLowerCase() } });
  if (!profile) return null;
  const vendor = await prisma.vendorProfile.findUnique({ where: { userId: profile.userId } });
  return vendor ? { profile, vendor } : null;
}

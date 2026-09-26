import { DomainError } from "@dinkuan/core";
import { prisma, type Prisma } from "@dinkuan/db";
import { visibleUsersWhere } from "@dinkuan/social";
import { z } from "zod";
import { isoDate, toDate } from "./availability";
import { LEVELS, MAX_COMPARE, SORTS, VENDOR_TYPES } from "./text";

const optionalInt = z.coerce.number().int().min(0).optional();

/** F20-AC9/AC10: browse by type, filter and sort. */
export const searchInput = z.object({
  type: z.enum(VENDOR_TYPES).optional(),
  q: z.string().trim().max(60).optional(),
  date: isoDate.optional(),
  minPriceSantim: optionalInt,
  maxPriceSantim: optionalInt,
  minRating: z.coerce.number().min(0).max(5).optional(),
  genre: z.string().trim().max(40).optional(),
  area: z.string().trim().max(40).optional(),
  level: z.enum(LEVELS).optional(),
  language: z.string().trim().max(40).optional(),
  sort: z.enum(SORTS).default("recommended"),
  page: z.coerce.number().int().min(0).max(50).default(0),
});
export type SearchInput = z.input<typeof searchInput>;

export const cardInclude = {
  user: { select: { profile: true } },
  albums: { take: 1, orderBy: { createdAt: "desc" }, select: { coverUrl: true } },
} satisfies Prisma.VendorProfileInclude;
export type VendorCardRow = Prisma.VendorProfileGetPayload<{ include: typeof cardInclude }>;

const PAGE = 20;

export function vendorWhere(input: z.infer<typeof searchInput>, viewerId: string | null): Prisma.VendorProfileWhereInput {
  const and: Prisma.VendorProfileWhereInput[] = [{ user: { ...visibleUsersWhere(viewerId), profile: { isNot: null } } }];
  if (input.type) and.push({ types: { has: input.type } });
  if (input.date) and.push({ availability: { none: { date: toDate(input.date) } } });
  if (input.minPriceSantim !== undefined) and.push({ startingPriceSantim: { gte: input.minPriceSantim } });
  if (input.maxPriceSantim !== undefined) and.push({ startingPriceSantim: { lte: input.maxPriceSantim } });
  if (input.minRating) and.push({ ratingAvg: { gte: Math.round(input.minRating * 100) } });
  if (input.genre) and.push({ genres: { has: input.genre } });
  if (input.area) and.push({ areas: { has: input.area } });
  if (input.level) and.push({ level: input.level });
  if (input.language) and.push({ languages: { has: input.language } });
  if (input.q) {
    const q = input.q;
    and.push({
      OR: [
        { headline: { contains: q, mode: "insensitive" } },
        { genres: { has: q } },
        { user: { profile: { username: { contains: q.toLowerCase() } } } },
        { user: { profile: { displayName: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  return { AND: and };
}

const ORDER: Record<(typeof SORTS)[number], Prisma.VendorProfileOrderByWithRelationInput[]> = {
  recommended: [{ qualityScore: "desc" }, { userId: "asc" }],
  top_rated: [{ ratingAvg: "desc" }, { ratingCount: "desc" }, { userId: "asc" }],
  price_asc: [{ startingPriceSantim: { sort: "asc", nulls: "last" } }, { userId: "asc" }],
  most_booked: [{ bookingsCount: "desc" }, { userId: "asc" }],
};

/**
 * Search results. `promotedIds` are vendors with an active "Vendor Top Search" promotion for this
 * type (F21-AC3); on the first page, those that match the filters are pinned to the top three
 * slots and returned separately so the UI labels them as sponsored (F21-AC6).
 */
export async function searchVendors(raw: SearchInput, viewerId: string | null, promotedIds: string[] = []) {
  const input = searchInput.parse(raw);
  if (
    input.minPriceSantim !== undefined &&
    input.maxPriceSantim !== undefined &&
    input.minPriceSantim > input.maxPriceSantim
  ) {
    throw new DomainError("VALIDATION", "Min price is above max price");
  }
  const where = vendorWhere(input, viewerId);
  const promoted =
    input.page === 0 && promotedIds.length
      ? await prisma.vendorProfile.findMany({
          where: { AND: [where, { userId: { in: promotedIds.slice(0, 3) } }] },
          include: cardInclude,
        })
      : [];
  // Keep the order the ad server chose.
  promoted.sort((a, b) => promotedIds.indexOf(a.userId) - promotedIds.indexOf(b.userId));
  const [rows, total] = await Promise.all([
    prisma.vendorProfile.findMany({
      where: { AND: [where, { userId: { notIn: promoted.map((p) => p.userId) } }] },
      include: cardInclude,
      orderBy: ORDER[input.sort],
      skip: input.page * PAGE,
      take: PAGE + 1,
    }),
    prisma.vendorProfile.count({ where }),
  ]);
  return {
    promoted,
    items: rows.slice(0, PAGE),
    total,
    nextPage: rows.length > PAGE ? input.page + 1 : null,
    availableOn: input.date ?? null,
  };
}

/** Filter options that actually have vendors, so the filter sheet never offers an empty choice. */
export async function searchFacets(type?: (typeof VENDOR_TYPES)[number]) {
  const rows = await prisma.vendorProfile.findMany({
    where: type ? { types: { has: type } } : {},
    select: { genres: true, languages: true, areas: true },
  });
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  return {
    genres: uniq(rows.flatMap((r) => r.genres)),
    languages: uniq(rows.flatMap((r) => r.languages)),
    areas: uniq(rows.flatMap((r) => r.areas)),
  };
}

/** How many vendors of each type there are, for the Hire tab. */
export async function typeCounts() {
  const rows = await prisma.$queryRaw<{ type: string; n: bigint }[]>`
    SELECT unnest(types)::text AS type, count(*) AS n FROM vendor_profiles GROUP BY 1`;
  return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)])) as Partial<Record<(typeof VENDOR_TYPES)[number], number>>;
}

/** F20-AC12: compare up to three vendors side by side. */
export async function compareVendors(ids: string[], viewerId: string | null) {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_COMPARE) throw new DomainError("COMPARE_LIMIT");
  const rows = await prisma.vendorProfile.findMany({
    where: { userId: { in: unique }, user: visibleUsersWhere(viewerId) },
    include: {
      ...cardInclude,
      packages: { where: { active: true }, orderBy: { priceSantim: "asc" }, include: { addons: true } },
      _count: { select: { albums: { where: { gigStatus: "verified" } } } },
    },
  });
  return unique.map((id) => rows.find((r) => r.userId === id)).filter((r) => r !== undefined);
}

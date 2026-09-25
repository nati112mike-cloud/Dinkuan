import "server-only";
import { addisCalendarDate, allInPrice } from "@dinkuan/core";
import { prisma, type EventCategory, type Prisma } from "@dinkuan/db";

export const CATEGORIES: EventCategory[] = [
  "nightlife",
  "concert",
  "festival",
  "comedy",
  "arts_culture",
  "conference",
  "sports",
  "community",
  "holiday",
];

const include = { venue: true, organiser: true, ticketTypes: { orderBy: { sortOrder: "asc" } } } satisfies Prisma.EventInclude;
export type EventCard = Prisma.EventGetPayload<{ include: typeof include }>;

/** Midnight in Addis `days` from the Addis date of `now`, as a UTC instant. */
function addisMidnight(now: Date, days: number): Date {
  const { year, month, day } = addisCalendarDate(now);
  return new Date(Date.UTC(year, month - 1, day + days, -3));
}

function addisWeekday(now: Date): number {
  const { year, month, day } = addisCalendarDate(now);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function dateRange(filter: string | undefined, now = new Date(), pick?: string): { from: Date; to?: Date } {
  switch (filter) {
    case "today":
      return { from: now, to: addisMidnight(now, 1) };
    case "weekend": {
      // Friday evening to Sunday night
      const wd = addisWeekday(now);
      const toFri = (5 - wd + 7) % 7;
      const start = wd === 0 || wd === 6 ? now : new Date(addisMidnight(now, toFri).getTime() + 17 * 3600_000);
      const toMon = (8 - wd) % 7 || 7;
      return { from: start < now ? now : start, to: addisMidnight(now, toMon) };
    }
    case "week":
      return { from: now, to: addisMidnight(now, 7) };
    case "date": {
      if (!pick || !/^\d{4}-\d{2}-\d{2}$/.test(pick)) return { from: now };
      const [y, m, d] = pick.split("-").map(Number) as [number, number, number];
      const from = new Date(Date.UTC(y, m - 1, d, -3));
      return { from, to: new Date(from.getTime() + 86400_000) };
    }
    default:
      return { from: now };
  }
}

export function minPrice(e: EventCard): number | null {
  const prices = e.ticketTypes.filter((t) => t.visibility === "public").map((t) => t.priceSantim);
  return prices.length ? Math.min(...prices) : null;
}

export function minAllIn(e: EventCard): number | null {
  const p = minPrice(e);
  return p === null ? null : allInPrice(p, { feePctBps: e.feePctBps, feeFixedSantim: e.feeFixedSantim });
}

export function isSoldOut(e: EventCard) {
  return e.ticketTypes.every((t) => t.sold + t.reserved >= t.capacity);
}

const PRICE_BANDS: Record<string, (p: number) => boolean> = {
  free: (p) => p === 0,
  under500: (p) => p > 0 && p < 50000,
  "500to1500": (p) => p >= 50000 && p <= 150000,
  over1500: (p) => p > 150000,
};

export async function findEvents(opts: {
  q?: string;
  date?: string;
  pick?: string;
  category?: string;
  price?: string;
  featured?: boolean;
  limit?: number;
}): Promise<EventCard[]> {
  const now = new Date();
  // Events that started in the last 3 hours still show (they are on right now).
  const range = dateRange(opts.date, now, opts.pick);
  const from = opts.date ? range.from : new Date(now.getTime() - 3 * 3600_000);
  const where: Prisma.EventWhereInput = {
    status: "published",
    startsAt: { gte: from, ...(range.to ? { lt: range.to } : {}) },
    ...(opts.featured ? { featured: true } : {}),
    ...(opts.category && CATEGORIES.includes(opts.category as EventCategory)
      ? { category: opts.category as EventCategory }
      : {}),
  };
  const q = opts.q?.trim();
  if (q) {
    // F4-AC3: title, venue, organiser and lineup, in Amharic and English.
    const like = `%${q}%`;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM events e
      JOIN venues v ON v.id = e.venue_id
      JOIN organisers o ON o.id = e.organiser_id
      WHERE e.title_en ILIKE ${like} OR e.title_am ILIKE ${like} OR v.name ILIKE ${like}
         OR o.name ILIKE ${like} OR array_to_string(e.lineup, ' ') ILIKE ${like}`;
    where.id = { in: ids.map((r) => r.id) };
  }
  let events = await prisma.event.findMany({ where, include, orderBy: { startsAt: "asc" }, take: 100 });
  const band = opts.price ? PRICE_BANDS[opts.price] : undefined;
  if (band) {
    // Demo scale: filter on the cheapest public tier in memory. Move to SQL with real volumes.
    events = events.filter((e) => {
      const p = minPrice(e);
      return p !== null && band(p);
    });
  }
  return opts.limit ? events.slice(0, opts.limit) : events;
}

export async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug }, include });
}

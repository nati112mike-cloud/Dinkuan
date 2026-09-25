import { prisma } from "@dinkuan/db";
import { visibleUsersWhere } from "@dinkuan/social";

/**
 * F20-AC6 (read side). Only clients with a completed booking can write reviews, which arrives
 * with bookings in Phase 2; the demo seeds reviews so pro profiles look real.
 */
export async function vendorReviews(vendorId: string, viewerId: string | null, take = 20) {
  const where = { vendorId, client: visibleUsersWhere(viewerId) };
  const [items, avg] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: { client: { select: { profile: true } } },
    }),
    prisma.review.aggregate({
      where: { vendorId },
      _avg: { punctuality: true, quality: true, value: true, communication: true },
    }),
  ]);
  const sub = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    items,
    subRatings: {
      punctuality: sub(avg._avg.punctuality),
      quality: sub(avg._avg.quality),
      value: sub(avg._avg.value),
      communication: sub(avg._avg.communication),
    },
  };
}

import { prisma } from "@dinkuan/db";
import { ticketQrCodes } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

/**
 * Wallet data for offline use (F6-AC4): each ticket with its static QR and the next hour of
 * rotating QRs, so the app can keep rotating codes with no connection.
 */
export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const tickets = await prisma.ticket.findMany({
      where: { holderUserId: user.id, status: { in: ["valid", "checked_in"] } },
      include: { ticketType: true, event: { include: { venue: true } } },
      orderBy: { event: { startsAt: "asc" } },
    });
    const now = new Date();
    const data = await Promise.all(
      tickets.map(async (t) => {
        const upcoming = (t.event.endsAt ?? t.event.startsAt) > now;
        const qr = upcoming && t.status === "valid" ? await ticketQrCodes(t, { now, minutes: 60 }) : null;
        return {
          id: t.id,
          status: t.status,
          holderName: t.holderName,
          typeName: t.ticketType.name,
          checkedInAt: t.checkedInAt,
          event: {
            id: t.event.id,
            slug: t.event.slug,
            titleEn: t.event.titleEn,
            titleAm: t.event.titleAm,
            startsAt: t.event.startsAt,
            endsAt: t.event.endsAt,
            venue: t.event.venue.name,
            posterUrl: t.event.posterUrl,
          },
          qr,
        };
      }),
    );
    return ok({ tickets: data, fetchedAt: now.toISOString() });
  } catch (e) {
    return handleError(e);
  }
}

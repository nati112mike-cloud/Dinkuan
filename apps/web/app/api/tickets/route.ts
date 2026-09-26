import { prisma } from "@dinkuan/db";
import { ticketQrCodes } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

/**
 * Wallet data for offline use (F6-AC4): each ticket with its rotating QRs from now until the
 * event ends (at least an hour, at most 12), so the app keeps rotating codes with no connection.
 * The static code never comes here (audit S13): it doesn't expire, so a screenshot of it would
 * work forever. It goes only to Telegram and SMS as the fallback.
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
        const untilEnd = Math.ceil(((t.event.endsAt ?? t.event.startsAt).getTime() - now.getTime()) / 60_000);
        const minutes = Math.min(12 * 60, Math.max(60, untilEnd));
        const qr = upcoming && t.status === "valid" ? { rotating: (await ticketQrCodes(t, { now, minutes })).rotating } : null;
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

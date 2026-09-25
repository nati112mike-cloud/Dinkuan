import { attendees, attendeesCsv, audit } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { fail, handleError } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F11-AC2: attendee list as CSV. Phones only where the buyer agreed (rule 12). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { id } = await params;
    const rows = await attendees(user.id, id);
    const event = await prisma.event.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    await audit({ actorUserId: user.id, action: "event.attendees_export", entity: "event", entityId: id, after: { rows: rows.length } });
    return new Response(attendeesCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-attendees.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

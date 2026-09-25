import { prisma } from "@dinkuan/db";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F4-AC7: toggle saving an event. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { id } = await params;
    const key = { userId_eventId: { userId: user.id, eventId: id } };
    const existing = await prisma.savedEvent.findUnique({ where: key });
    if (existing) await prisma.savedEvent.delete({ where: key });
    else await prisma.savedEvent.create({ data: { userId: user.id, eventId: id } });
    return ok({ saved: !existing });
  } catch (e) {
    return handleError(e);
  }
}

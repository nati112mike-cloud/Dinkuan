import { prisma } from "@dinkuan/db";
import { verifyOrderWithGateway } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** Order status for the return page. A pending order is re-checked server-to-server (F5-AC6). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order || order.userId !== user.id) return fail("NOT_FOUND");
    const fresh = await verifyOrderWithGateway(order.id);
    return ok({ status: fresh.status, number: fresh.number, totalSantim: fresh.totalSantim });
  } catch (e) {
    return handleError(e);
  }
}

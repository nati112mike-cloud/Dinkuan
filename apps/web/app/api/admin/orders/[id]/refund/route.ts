import { refundOrderInFull } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F12-AC1: retry a refund the gateway refused earlier. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    return ok({ refunded: await refundOrderInFull((await params).id, "Admin retry", user.id) });
  } catch (e) {
    return handleError(e);
  }
}

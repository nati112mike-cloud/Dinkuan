import { stopCampaign } from "@dinkuan/ads";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F21-AC8: stop early; the unspent budget is refunded through the gateway. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const c = await stopCampaign(me.user.id, (await params).id);
    return ok({ status: c.status, refundedSantim: c.refundedSantim });
  } catch (e) {
    return handleError(e);
  }
}

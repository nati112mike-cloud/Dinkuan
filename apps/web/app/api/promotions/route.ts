import { buyInput, buyPromotion } from "@dinkuan/ads";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F21-AC3: buy a ready-made promotion package; returns the gateway checkout URL. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, buyInput);
    const { campaign, checkoutUrl } = await buyPromotion(me.user.id, input);
    return ok({ campaignId: campaign.id, checkoutUrl });
  } catch (e) {
    return handleError(e, req);
  }
}

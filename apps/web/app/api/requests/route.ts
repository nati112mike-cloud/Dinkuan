import { createRequest, requestInput } from "@dinkuan/marketplace";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { clickedCampaign } from "@/lib/ads";
import { currentMember } from "@/lib/social";

/** F20-AC14: send a booking request; opens a chat with the vendor. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, requestInput);
    const { conversationId } = await createRequest(me.user.id, input, { campaignId: await clickedCampaign() });
    return ok({ conversationId });
  } catch (e) {
    return handleError(e, req);
  }
}

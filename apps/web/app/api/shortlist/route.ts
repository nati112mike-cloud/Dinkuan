import { toggleShortlist } from "@dinkuan/marketplace";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC12: save or unsave a vendor on your shortlist. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const { vendorId } = await parseJson(req, z.object({ vendorId: z.uuid() }));
    return ok({ saved: await toggleShortlist(me.user.id, vendorId) });
  } catch (e) {
    return handleError(e, req);
  }
}

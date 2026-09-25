import { isoDate, setBlockedDates } from "@dinkuan/marketplace";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC5: block or free dates on your calendar. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(
      req,
      z.object({ block: z.array(isoDate).max(62).optional(), unblock: z.array(isoDate).max(62).optional() }),
    );
    await setBlockedDates(me.user.id, input);
    return ok({ saved: true });
  } catch (e) {
    return handleError(e);
  }
}

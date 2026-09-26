import { addCredit, creditInput } from "@dinkuan/marketplace";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC3: add a stage credit ("played at …"). Unverified until tied to a confirmed gig. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, creditInput);
    const c = await addCredit(me.user.id, input);
    return ok({ id: c.id, name: c.name, verified: c.verified });
  } catch (e) {
    return handleError(e, req);
  }
}

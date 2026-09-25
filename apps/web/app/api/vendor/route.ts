import { saveVendorProfile, vendorInput } from "@dinkuan/marketplace";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC1: create or edit your own pro profile. */
export async function PUT(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, vendorInput);
    const v = await saveVendorProfile(me.user.id, input);
    return ok({ userId: v.userId });
  } catch (e) {
    return handleError(e);
  }
}

import { feeInput, setFeeOverride } from "@dinkuan/core/server";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F12-AC2: per-event fee override. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const e = await setFeeOverride(user.id, (await params).id, await parseJson(req, feeInput));
    return ok({ feePctBps: e.feePctBps, feeFixedSantim: e.feeFixedSantim });
  } catch (e) {
    return handleError(e, req);
  }
}

import { reviewCampaign } from "@dinkuan/ads";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F21-AC5: admin ad review. Approve starts the run; reject refunds in full. Audit-logged. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const { approve, note } = await parseJson(req, z.object({ approve: z.boolean(), note: z.string().max(300).optional() }));
    const c = await reviewCampaign(user.id, (await params).id, approve, note);
    return ok({ status: c.status });
  } catch (e) {
    return handleError(e, req);
  }
}

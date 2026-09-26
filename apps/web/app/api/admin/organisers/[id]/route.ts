import { reviewOrganiser } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F2 / F12-AC1: approve or reject an organiser application. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const { approve, reason } = await parseJson(req, z.object({ approve: z.boolean(), reason: z.string().max(300).optional() }));
    const org = await reviewOrganiser(user.id, (await params).id, approve, reason);
    return ok({ status: org.status });
  } catch (e) {
    return handleError(e);
  }
}

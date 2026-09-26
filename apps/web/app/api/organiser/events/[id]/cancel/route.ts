import { cancelEvent } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F3-AC7: cancel and refund every buyer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { reason } = await parseJson(req, z.object({ reason: z.string() }));
    return ok(await cancelEvent(user.id, (await params).id, reason));
  } catch (e) {
    return handleError(e, req);
  }
}

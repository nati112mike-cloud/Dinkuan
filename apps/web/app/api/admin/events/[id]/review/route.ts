import { reviewEvent } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F3-AC5: publish an event in review, or send it back with a note. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const { approve, note } = await parseJson(req, z.object({ approve: z.boolean(), note: z.string().max(300).optional() }));
    const e = await reviewEvent(user.id, (await params).id, approve, note);
    return ok({ status: e.status });
  } catch (e) {
    return handleError(e);
  }
}

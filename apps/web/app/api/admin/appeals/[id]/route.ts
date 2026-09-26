import { decideAppeal } from "@dinkuan/moderation";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F22-AC6: a different moderator keeps or reverses the decision. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const { overturn, note } = await parseJson(req, z.object({ overturn: z.boolean(), note: z.string().max(500).optional() }));
    const a = await decideAppeal(user.id, (await params).id, overturn, note);
    return ok({ status: a.status });
  } catch (e) {
    return handleError(e);
  }
}

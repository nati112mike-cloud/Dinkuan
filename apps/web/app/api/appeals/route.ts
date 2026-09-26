import { APPEAL_MAX, fileAppeal } from "@dinkuan/moderation";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F22-AC6: appeal a moderation decision about you, once. */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, z.object({ actionId: z.uuid(), text: z.string().min(10).max(APPEAL_MAX) }));
    const a = await fileAppeal(user.id, input.actionId, input.text);
    return ok({ id: a.id });
  } catch (e) {
    return handleError(e);
  }
}

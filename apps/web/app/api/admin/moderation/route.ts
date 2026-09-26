import { moderate, moderateInput } from "@dinkuan/moderation";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F22-AC4: a moderator acts on a queue item. Audit-logged in the moderation package. */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const input = await parseJson(req, moderateInput);
    const { action, escalated } = await moderate(user.id, input);
    return ok({ id: action.id, escalated });
  } catch (e) {
    return handleError(e, req);
  }
}

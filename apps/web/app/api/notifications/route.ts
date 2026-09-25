import { markAllRead } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

export async function POST() {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    await markAllRead(user.id);
    return ok({ read: true });
  } catch (e) {
    return handleError(e);
  }
}

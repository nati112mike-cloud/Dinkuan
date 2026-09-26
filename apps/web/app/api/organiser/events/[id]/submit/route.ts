import { submitEvent } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F3-AC5: publish, or send to review for a new organiser's first events. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const event = await submitEvent(user.id, (await params).id);
    return ok({ status: event.status, slug: event.slug });
  } catch (e) {
    return handleError(e);
  }
}

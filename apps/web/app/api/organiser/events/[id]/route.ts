import { eventInput, updateEvent } from "@dinkuan/core/server";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const event = await updateEvent(user.id, (await params).id, await parseJson(req, eventInput));
    return ok({ id: event.id });
  } catch (e) {
    return handleError(e, req);
  }
}

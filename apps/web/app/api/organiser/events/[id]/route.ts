import { eventInput, updateEvent } from "@dinkuan/core/server";
import { assertCleanText } from "@dinkuan/moderation";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, eventInput);
    assertCleanText(input.titleEn, input.titleAm, input.descEn, input.descAm, ...(input.lineup ?? []));
    const event = await updateEvent(user.id, (await params).id, input);
    return ok({ id: event.id });
  } catch (e) {
    return handleError(e, req);
  }
}

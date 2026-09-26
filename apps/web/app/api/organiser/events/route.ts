import { createEvent, eventInput } from "@dinkuan/core/server";
import { assertCleanText } from "@dinkuan/moderation";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F3: create a draft event (step 1 of the wizard). */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { organiserId, ...input } = await parseJson(req, z.object({ organiserId: z.uuid() }).and(eventInput));
    assertCleanText(input.titleEn, input.titleAm, input.descEn, input.descAm, ...(input.lineup ?? []));
    const event = await createEvent(user.id, organiserId, input);
    return ok({ id: event.id, slug: event.slug });
  } catch (e) {
    return handleError(e, req);
  }
}

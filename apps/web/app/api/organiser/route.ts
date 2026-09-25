import { organiserInput, saveOrganiserApplication } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F2: save or submit your organiser application. */
export async function PUT(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { submit, ...input } = await parseJson(req, z.object({ submit: z.boolean() }).and(organiserInput));
    const org = await saveOrganiserApplication(user.id, input, submit);
    return ok({ id: org.id, status: org.status });
  } catch (e) {
    return handleError(e);
  }
}

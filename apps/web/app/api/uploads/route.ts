import { startUpload } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F15-AC6: start a resumable upload; the client then sends chunks to /api/uploads/[id]. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, z.object({ contentType: z.string(), size: z.number().int() }));
    return ok(await startUpload(me.user.id, input));
  } catch (e) {
    return handleError(e);
  }
}

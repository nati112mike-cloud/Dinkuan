import { toggleSave } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F16-AC5: save to a private collection (toggle). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const { collection } = await parseJson(req, z.object({ collection: z.string().max(40).default("") }));
    return ok(await toggleSave(me.user.id, (await params).id, collection));
  } catch (e) {
    return handleError(e, req);
  }
}

import { addComment, listComments } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { currentMember } from "@/lib/social";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await currentUser();
    return ok(await listComments((await params).id, user?.id ?? null));
  } catch (e) {
    return handleError(e);
  }
}

/** F16-AC3: comment or reply (one level). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, z.object({ body: z.string().min(1).max(500), parentId: z.uuid().nullable().optional() }));
    return ok(await addComment(me.user.id, (await params).id, input.body, input.parentId));
  } catch (e) {
    return handleError(e);
  }
}

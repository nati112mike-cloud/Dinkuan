import { react, REACTIONS, unreact } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

type Ctx = { params: Promise<{ id: string }> };

/** F16-AC2: set my reaction (double-tap sends "like"). */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const { type } = await parseJson(req, z.object({ type: z.enum(REACTIONS) }));
    return ok(await react(me.user.id, (await params).id, type));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    return ok(await unreact(me.user.id, (await params).id));
  } catch (e) {
    return handleError(e);
  }
}

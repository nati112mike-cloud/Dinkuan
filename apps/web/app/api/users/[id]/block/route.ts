import { unblock, block } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    return ok({ status: (await block(me.user.id, (await params).id)) ?? "done" });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    await unblock(me.user.id, (await params).id);
    return ok({ status: "none" });
  } catch (e) {
    return handleError(e);
  }
}

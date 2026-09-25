import { approveFollowRequest, declineFollowRequest } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

type Ctx = { params: Promise<{ id: string }> };

/** F14-AC4: approve a follow request (id = the requester's user id). */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    await approveFollowRequest(me.user.id, (await params).id);
    return ok({ status: "active" });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    await declineFollowRequest(me.user.id, (await params).id);
    return ok({ status: "none" });
  } catch (e) {
    return handleError(e);
  }
}

import { declineRequest } from "@dinkuan/marketplace";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const r = await declineRequest(me.user.id, (await params).id);
    return ok({ status: r.status });
  } catch (e) {
    return handleError(e);
  }
}

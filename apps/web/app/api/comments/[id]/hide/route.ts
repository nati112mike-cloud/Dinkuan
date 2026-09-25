import { hideComment } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    return ok((await hideComment(me.user.id, (await params).id)) ?? { done: true });
  } catch (e) {
    return handleError(e);
  }
}

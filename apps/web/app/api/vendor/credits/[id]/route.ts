import { removeCredit } from "@dinkuan/marketplace";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    await removeCredit(me.user.id, (await params).id);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}

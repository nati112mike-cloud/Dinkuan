import { getConversation } from "@dinkuan/marketplace";
import { fail, handleError, ok } from "@/lib/api";
import { toChatDTO } from "@/lib/chat";
import { currentMember } from "@/lib/social";

/** Polled by the chat screen. Only the two participants can read it (rule 7). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    return ok(toChatDTO(await getConversation(me.user.id, (await params).id)));
  } catch (e) {
    return handleError(e);
  }
}

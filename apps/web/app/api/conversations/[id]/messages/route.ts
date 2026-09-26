import { sendMessage } from "@dinkuan/marketplace";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import type { ChatMessageDTO } from "@/lib/chat";
import { currentMember } from "@/lib/social";

/** F20-AC15: send a chat message. Contact details are masked until a deposit is paid (rule 16). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const { text } = await parseJson(req, z.object({ text: z.string() }));
    const m = await sendMessage(me.user.id, (await params).id, text);
    const dto: ChatMessageDTO = { id: m.id, body: m.body, masked: m.masked, removed: false, mine: true, createdAt: m.createdAt.toISOString() };
    return ok(dto);
  } catch (e) {
    return handleError(e, req);
  }
}

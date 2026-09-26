import { sharePost } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F16-AC4: repost to my profile, or record a share to Telegram/WhatsApp/copy link. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, z.object({ type: z.enum(["repost", "external"]), comment: z.string().max(500).optional() }));
    const share = await sharePost(me.user.id, (await params).id, input.type, input.comment);
    return ok({ id: share.id });
  } catch (e) {
    return handleError(e, req);
  }
}

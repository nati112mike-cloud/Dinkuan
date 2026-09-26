import { confirmGig } from "@dinkuan/marketplace";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC2: the event's organiser confirms or declines a vendor's "I worked this gig". */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const { approve } = await parseJson(req, z.object({ approve: z.boolean() }));
    const album = await confirmGig(me.user.id, (await params).id, approve);
    return ok({ gigStatus: album.gigStatus });
  } catch (e) {
    return handleError(e, req);
  }
}

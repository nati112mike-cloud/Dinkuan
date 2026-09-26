import { eventMoments } from "@dinkuan/social";
import { handleError, ok } from "@/lib/api";
import { currentLang, currentUser } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

/** F15-AC5: posts tagged to the event. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    const viewer = user?.id ?? null;
    const page = await eventMoments((await params).id, viewer, new URL(req.url).searchParams.get("cursor"));
    const lang = await currentLang();
    return ok({ items: page.items.map((p) => toPostDTO(p, viewer, lang)), nextCursor: page.nextCursor });
  } catch (e) {
    return handleError(e, req);
  }
}

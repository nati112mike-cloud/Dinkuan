import { reelsFeed } from "@dinkuan/social";
import { handleError, ok } from "@/lib/api";
import { currentLang, currentUser } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

/** F16-AC7: reels, cursor-paginated. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = await currentUser();
    const viewer = user?.id ?? null;
    const page = await reelsFeed(viewer, url.searchParams.get("cursor"));
    const lang = await currentLang();
    return ok({ items: page.items.map((p) => toPostDTO(p, viewer, lang)), nextCursor: page.nextCursor });
  } catch (e) {
    return handleError(e);
  }
}

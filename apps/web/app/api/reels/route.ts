import { reelsFeed } from "@dinkuan/social";
import { handleError, ok } from "@/lib/api";
import { currentLang, currentUser } from "@/lib/session";
import { withSponsoredPosts } from "@/lib/ads";
import { toPostDTO } from "@/lib/social";

/** F16-AC7: reels, cursor-paginated. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const user = await currentUser();
    const viewer = user?.id ?? null;
    const cursor = url.searchParams.get("cursor");
    const page = await reelsFeed(viewer, cursor);
    const lang = await currentLang();
    const items = await withSponsoredPosts(
      page.items.map((p) => toPostDTO(p, viewer, lang)),
      "reels",
      { viewerId: viewer, lang, firstPage: !cursor },
    );
    return ok({ items, nextCursor: page.nextCursor });
  } catch (e) {
    return handleError(e, req);
  }
}

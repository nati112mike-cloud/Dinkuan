import { followingFeed, forYouFeed } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentLang, currentUser } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

/** F16-AC1: For You and Following feeds, cursor-paginated (CLAUDE.md rule 19). */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") ?? "foryou";
    const cursor = url.searchParams.get("cursor");
    const user = await currentUser();
    const viewer = user?.id ?? null;
    if (tab === "following" && !viewer) return fail("UNAUTHENTICATED");
    const page = tab === "following" ? await followingFeed(viewer!, cursor) : await forYouFeed(viewer, cursor);
    const lang = await currentLang();
    return ok({ items: page.items.map((p) => toPostDTO(p, viewer, lang)), nextCursor: page.nextCursor });
  } catch (e) {
    return handleError(e);
  }
}

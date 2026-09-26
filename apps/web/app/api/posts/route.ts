import { createPost, getPost, postInput } from "@dinkuan/social";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentLang } from "@/lib/session";
import { currentMember, toPostDTO } from "@/lib/social";

/** F15: create a post (photos, video, text or meme), screened before it goes public. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, postInput);
    const post = await createPost(me.user.id, input);
    const view = await getPost(post.id, me.user.id);
    return ok(view ? toPostDTO(view, me.user.id, await currentLang()) : { id: post.id });
  } catch (e) {
    return handleError(e, req);
  }
}

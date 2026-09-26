import { deletePost, editCaption, getPost } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentLang, currentUser } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const user = await currentUser();
    const post = await getPost((await params).id, user?.id ?? null);
    if (!post) return fail("NOT_FOUND");
    return ok(toPostDTO(post, user?.id ?? null, await currentLang()));
  } catch (e) {
    return handleError(e, _req);
  }
}

/** F15-AC4: edit the caption within 24 hours. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { caption } = await parseJson(req, z.object({ caption: z.string().max(2000) }));
    const post = await editCaption(user.id, (await params).id, caption);
    return ok({ caption: post.caption, status: post.status });
  } catch (e) {
    return handleError(e, req);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    await deletePost(user.id, (await params).id);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e, _req);
  }
}

import { deleteComment } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    await deleteComment(user.id, (await params).id);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}

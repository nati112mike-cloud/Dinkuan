import { albumInput, createAlbum } from "@dinkuan/marketplace";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC2: add a portfolio album, optionally tagged to a Dinkuan event for verification. */
export async function POST(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const input = await parseJson(req, albumInput);
    const album = await createAlbum(me.user.id, input);
    return ok({ id: album.id });
  } catch (e) {
    return handleError(e);
  }
}

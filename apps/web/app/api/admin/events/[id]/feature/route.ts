import { setFeatured } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, isAdmin } from "@/lib/session";

/** F12-AC2: feature an event on Home. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    if (!isAdmin(user)) return fail("FORBIDDEN");
    const { featured } = await parseJson(req, z.object({ featured: z.boolean() }));
    const e = await setFeatured(user.id, (await params).id, featured);
    return ok({ featured: e.featured });
  } catch (e) {
    return handleError(e);
  }
}

import { offlinePack } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";
import { currentUser } from "@/lib/session";

export const OPTIONS = preflight;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser({ scanner: true });
    if (!user) return withCors(req, fail("UNAUTHENTICATED"));
    const { id } = await params;
    return withCors(req, ok(await offlinePack(user, id)));
  } catch (e) {
    return withCors(req, handleError(e, req));
  }
}

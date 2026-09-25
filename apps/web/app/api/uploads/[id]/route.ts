import { appendChunk, uploadStatus } from "@dinkuan/social";
import { fail, handleError, ok } from "@/lib/api";
import { currentMember } from "@/lib/social";

type Ctx = { params: Promise<{ id: string }> };

/** How many bytes arrived, so a dropped upload resumes from there. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    return ok(await uploadStatus(me.user.id, (await params).id));
  } catch (e) {
    return handleError(e);
  }
}

/** One chunk; the `x-offset` header says where it starts. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const offset = Number(req.headers.get("x-offset"));
    if (!Number.isInteger(offset) || offset < 0) return fail("VALIDATION", "x-offset header required");
    const chunk = new Uint8Array(await req.arrayBuffer());
    return ok(await appendChunk(me.user.id, (await params).id, offset, chunk));
  } catch (e) {
    return handleError(e);
  }
}

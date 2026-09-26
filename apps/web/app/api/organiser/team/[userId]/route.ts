import { removeTeamMember } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";

export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const organiserId = z.uuid().parse(new URL(req.url).searchParams.get("organiser"));
    await removeTeamMember(user.id, organiserId, z.uuid().parse((await params).userId));
    return ok({ removed: true });
  } catch (e) {
    return handleError(e, req);
  }
}

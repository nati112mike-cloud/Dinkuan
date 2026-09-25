import { addTeamMember, teamInput } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F2-AC5: add a manager or scanner by phone. */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { organiserId, ...input } = await parseJson(req, z.object({ organiserId: z.uuid() }).and(teamInput));
    const m = await addTeamMember(user.id, organiserId, input);
    return ok({ userId: m.userId, role: m.role });
  } catch (e) {
    return handleError(e);
  }
}

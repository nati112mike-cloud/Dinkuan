import { packageInput, savePackages } from "@dinkuan/marketplace";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentMember } from "@/lib/social";

/** F20-AC4: save your Basic, Standard and Premium packages with add-ons. */
export async function PUT(req: Request) {
  try {
    const me = await currentMember();
    if (!me) return fail("UNAUTHENTICATED");
    const { packages } = await parseJson(req, z.object({ packages: z.array(packageInput).max(3) }));
    const saved = await savePackages(me.user.id, packages);
    return ok({ count: saved.length });
  } catch (e) {
    return handleError(e);
  }
}

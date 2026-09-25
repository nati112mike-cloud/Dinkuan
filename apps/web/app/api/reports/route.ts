import { report, REPORT_REASONS } from "@dinkuan/social";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F22-AC3: report a post, comment or profile. */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const input = await parseJson(
      req,
      z.object({
        targetType: z.enum(["post", "comment", "profile"]),
        targetId: z.uuid(),
        reason: z.enum(REPORT_REASONS),
        details: z.string().max(1000).optional(),
      }),
    );
    const r = await report(user.id, input);
    return ok({ id: r.id });
  } catch (e) {
    return handleError(e);
  }
}

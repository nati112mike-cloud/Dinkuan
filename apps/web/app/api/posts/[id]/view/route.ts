import { recordView } from "@dinkuan/social";
import { z } from "zod";
import { handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F16-AC9: watch time and completions, for ranking and creator analytics. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    const input = await parseJson(req, z.object({ watchedMs: z.number().min(0).max(3_600_000), completed: z.boolean() }));
    await recordView((await params).id, user?.id ?? null, input.watchedMs, input.completed);
    return ok({ recorded: true });
  } catch (e) {
    return handleError(e, req);
  }
}

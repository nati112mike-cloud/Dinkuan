import { saveTicketTypes, ticketTypeInput } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** F3-AC3/AC6: save the tickets step. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { types } = await parseJson(req, z.object({ types: z.array(ticketTypeInput) }));
    const saved = await saveTicketTypes(user.id, (await params).id, types);
    return ok({ count: saved.length });
  } catch (e) {
    return handleError(e, req);
  }
}

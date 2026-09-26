import { syncCheckIns } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";
import { currentUser } from "@/lib/session";

export const OPTIONS = preflight;

const schema = z.object({
  checkIns: z
    .array(z.object({ ticketId: z.uuid(), scannedAt: z.iso.datetime(), gate: z.string().min(1).max(40) }))
    .max(1000),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await currentUser({ scanner: true });
    if (!user) return withCors(req, fail("UNAUTHENTICATED"));
    const { id } = await params;
    const { checkIns } = await parseJson(req, schema);
    return withCors(req, ok({ results: await syncCheckIns(user, id, checkIns) }));
  } catch (e) {
    return withCors(req, handleError(e, req));
  }
}

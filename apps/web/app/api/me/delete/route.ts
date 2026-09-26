import { deleteAccount } from "@dinkuan/core/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser, SESSION_COOKIE } from "@/lib/session";

/** PDPP: delete your account. The member types DELETE to confirm. */
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { confirm } = await parseJson(req, z.object({ confirm: z.string() }));
    if (confirm.trim().toUpperCase() !== "DELETE") return fail("VALIDATION", "Type DELETE to confirm");
    await deleteAccount(user.id);
    (await cookies()).delete(SESSION_COOKIE);
    return ok({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}

import { exportUserData } from "@dinkuan/core/server";
import { fail, handleError, limitByUser } from "@/lib/api";
import { currentUser } from "@/lib/session";

/** PDPP: download everything ድንኳን holds about you, as a JSON file. */
export async function GET(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    await limitByUser(user.id, "exportUser");
    const data = await exportUserData(user.id);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="dinkuan-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    return handleError(e, req);
  }
}

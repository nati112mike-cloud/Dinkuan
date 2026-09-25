import { searchPeople, suggestPeople } from "@dinkuan/social";
import { handleError, ok } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { toProfileDTO } from "@/lib/social";

/** F17-AC3/AC4: search people, or suggestions when there is no query. */
export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    const user = await currentUser();
    if (q) return ok((await searchPeople(q, user?.id ?? null)).map((p) => ({ profile: toProfileDTO(p), reason: null })));
    if (!user) return ok([]);
    return ok((await suggestPeople(user.id, 20)).map((s) => ({ profile: toProfileDTO(s.profile), reason: s.reason })));
  } catch (e) {
    return handleError(e);
  }
}

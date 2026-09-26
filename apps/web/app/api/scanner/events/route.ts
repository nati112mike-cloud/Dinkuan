import { scannableEvents } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";
import { currentUser } from "@/lib/session";

export const OPTIONS = preflight;

export async function GET(req: Request) {
  try {
    const user = await currentUser({ scanner: true });
    if (!user) return withCors(req, fail("UNAUTHENTICATED"));
    const events = await scannableEvents(user);
    return withCors(
      req,
      ok(
        events.map((e) => ({
          id: e.id,
          title: e.titleEn ?? e.titleAm,
          titleAm: e.titleAm,
          startsAt: e.startsAt,
          venue: e.venue.name,
        })),
      ),
    );
  } catch (e) {
    return withCors(req, handleError(e, req));
  }
}

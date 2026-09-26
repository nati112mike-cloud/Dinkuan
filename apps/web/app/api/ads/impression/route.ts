import { recordImpression } from "@dinkuan/ads";
import { cookies } from "next/headers";
import { z } from "zod";
import { newVisitorId, VISITOR_COOKIE, viewerKey } from "@/lib/ads";
import { handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

const PLACEMENTS = ["feed", "reels", "events_featured", "home_weekend", "search_top"] as const;

/** F21-AC7/AC9: counts one impression of a sponsored item (capped at 3 a day per person). */
export async function POST(req: Request) {
  try {
    const { campaignId, placement } = await parseJson(req, z.object({ campaignId: z.uuid(), placement: z.enum(PLACEMENTS) }));
    const user = await currentUser();
    let key = await viewerKey(user?.id ?? null);
    if (!key) {
      key = newVisitorId();
      (await cookies()).set(VISITOR_COOKIE, key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
    }
    return ok({ counted: await recordImpression(campaignId, key, placement) });
  } catch (e) {
    return handleError(e);
  }
}

import { recordClick } from "@dinkuan/ads";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { limitByIp } from "@/lib/api";
import { AD_COOKIE, AD_COOKIE_DAYS, newVisitorId, VISITOR_COOKIE, viewerKey } from "@/lib/ads";
import { currentUser } from "@/lib/session";

const input = z.object({
  c: z.uuid(),
  p: z.enum(["feed", "reels", "events_featured", "home_weekend", "search_top"]),
});

/**
 * F21-AC7: a click on a sponsored item. Counts the click, remembers the promotion for a week so a
 * later ticket sale or booking request is credited to it, and redirects to the promoted thing.
 * The destination comes from the campaign, never from the URL.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = input.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.redirect(new URL("/", url));
  // Click floods from one IP aren't counted (they would inflate results and spend).
  const limited = await limitByIp(req, "adEventIp").then(() => false, () => true);
  if (limited) return NextResponse.redirect(new URL("/", url));
  const user = await currentUser();
  const jar = await cookies();
  let key = await viewerKey(user?.id ?? null);
  // A visitor without an id yet (a bot, or cookies cleared on every request) isn't counted (audit S16).
  const known = !!key;
  if (!key) {
    key = newVisitorId();
    jar.set(VISITOR_COOKIE, key, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  const result = await recordClick(parsed.data.c, key, parsed.data.p, { countable: known });
  if (!result) return NextResponse.redirect(new URL("/", url));
  if (result.countable) {
    jar.set(AD_COOKIE, parsed.data.c, { httpOnly: true, sameSite: "lax", path: "/", maxAge: AD_COOKIE_DAYS * 86400 });
  }
  return NextResponse.redirect(new URL(result.href, url), 303);
}

import { NextResponse, type NextRequest } from "next/server";

const VISITOR_COOKIE = "dk_vid";

/**
 * Gives every browser an anonymous visitor id on its first page load, so a quick first click on a
 * promotion still counts (audit S16 only skips clicks and impressions with no id at all, which is
 * what a cookie-less bot looks like). Kept in step with VISITOR_COOKIE in lib/ads.ts.
 */
export function proxy(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.has(VISITOR_COOKIE)) {
    res.cookies.set(VISITOR_COOKIE, `v_${crypto.randomUUID()}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  }
  return res;
}

export const config = {
  // Pages only: not API routes, build assets or static files.
  matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};

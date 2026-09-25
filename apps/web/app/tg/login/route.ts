import { redeemTelegramLoginToken, safeNextPath } from "@dinkuan/core/server";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";

export const dynamic = "force-dynamic";

function redirect(to: string, req: NextRequest) {
  const res = NextResponse.redirect(new URL(to, req.nextUrl.origin));
  // The link is single-use: never cache it or pass it on in a Referer.
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}

/**
 * F7-AC2: one-time sign-in link from the Telegram bot's Buy / My tickets buttons. A valid,
 * unused, unexpired token starts a session exactly like OTP login and goes on to `next`
 * (same-site paths only). Anything else goes to the normal login page.
 */
export async function GET(req: NextRequest) {
  const next = safeNextPath(req.nextUrl.searchParams.get("next"));
  const login = await redeemTelegramLoginToken(req.nextUrl.searchParams.get("token"));
  if (!login) return redirect(`/login?next=${encodeURIComponent(next)}`, req);
  const res = redirect(next, req);
  res.cookies.set(SESSION_COOKIE, login.sessionToken, SESSION_COOKIE_OPTIONS);
  return res;
}

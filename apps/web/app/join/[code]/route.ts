import { NextResponse } from "next/server";
import { REF_COOKIE } from "@/lib/social";

/** F17-AC5: invite link. Remembers the code so the new member's profile credits the inviter. */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const res = NextResponse.redirect(new URL("/login?next=/welcome", req.url));
  if (/^[A-Za-z0-9]{4,16}$/.test(code)) {
    res.cookies.set(REF_COOKIE, code.toUpperCase(), { maxAge: 30 * 86400, httpOnly: true, sameSite: "lax", path: "/" });
  }
  return res;
}

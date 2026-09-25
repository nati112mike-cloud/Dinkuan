import { SESSION_TTL_MS, verifyOtp } from "@dinkuan/core/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { handleError, ok, parseJson } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";
import { SESSION_COOKIE } from "@/lib/session";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    const body = await parseJson(
      req,
      z.object({ phone: z.string().min(9).max(20), code: z.string().regex(/^\d{6}$/), client: z.enum(["web", "scanner"]).optional() }),
    );
    const { token, user, isNew } = await verifyOtp(body.phone, body.code);
    const payload = { user: { id: user.id, name: user.name, phone: user.phone, lang: user.lang }, isNew };
    if (body.client === "scanner") return withCors(req, ok({ ...payload, token }));
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return ok(payload);
  } catch (e) {
    return withCors(req, handleError(e));
  }
}

import { verifyOtp } from "@dinkuan/core/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { handleError, limitByIp, ok, parseJson } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/session";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    const body = await parseJson(
      req,
      z.object({ phone: z.string().min(9).max(20), code: z.string().regex(/^\d{6}$/), client: z.enum(["web", "scanner"]).optional() }),
    );
    await limitByIp(req, "otpVerifyIp");
    const { token, user, isNew } = await verifyOtp(body.phone, body.code);
    const payload = { user: { id: user.id, name: user.name, phone: user.phone, lang: user.lang }, isNew };
    if (body.client === "scanner") return withCors(req, ok({ ...payload, token }));
    (await cookies()).set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return ok(payload);
  } catch (e) {
    return withCors(req, handleError(e, req));
  }
}

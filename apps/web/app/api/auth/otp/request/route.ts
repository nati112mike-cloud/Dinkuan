import { requestOtp } from "@dinkuan/core/server";
import { z } from "zod";
import { handleError, limitByIp, ok, parseJson } from "@/lib/api";
import { preflight, withCors } from "@/lib/cors";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  try {
    const { phone } = await parseJson(req, z.object({ phone: z.string().min(9).max(20) }));
    await limitByIp(req, "otpRequestIp");
    const res = await requestOtp(phone);
    return withCors(req, ok({ phone: res.phone, demo: process.env.DEMO_MODE === "true" }));
  } catch (e) {
    return withCors(req, handleError(e, req));
  }
}

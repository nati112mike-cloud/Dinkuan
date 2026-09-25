import { handlePaymentWebhook } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { drainTelegramAfterResponse } from "@/lib/telegram";

/** Gateway notify callback. Signature is verified inside handlePaymentWebhook (F5-AC6/AC7). */
export async function POST(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  try {
    const { gateway } = await params;
    if (gateway !== "telebirr" && gateway !== "chapa") return fail("NOT_FOUND");
    const raw = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const res = await handlePaymentWebhook(gateway, raw, headers);
    // F7-AC3: send the tickets to Telegram once the gateway has its answer.
    if (res.result === "paid") drainTelegramAfterResponse();
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}

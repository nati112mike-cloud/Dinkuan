import { handlePaymentWebhook } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";

/** Gateway notify callback. Signature is verified inside handlePaymentWebhook (F5-AC6/AC7). */
export async function POST(req: Request, { params }: { params: Promise<{ gateway: string }> }) {
  try {
    const { gateway } = await params;
    if (gateway !== "telebirr" && gateway !== "chapa") return fail("NOT_FOUND");
    const raw = await req.text();
    const headers = Object.fromEntries(req.headers.entries());
    const res = await handlePaymentWebhook(gateway, raw, headers);
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}

import { demoPaymentStore, handlePaymentWebhook, isDemoMode, webhookSecret } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { signDemoWebhook, DEMO_SIGNATURE_HEADER } from "@dinkuan/payments";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";
import { drainTelegramAfterResponse } from "@/lib/telegram";

/**
 * Demo gateway only: the buyer confirms or cancels on the fake payment page. This plays the
 * gateway's part (update its own state, then send a signed webhook). The order itself is still
 * only marked paid by the normal verified-webhook path.
 */
export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    if (!isDemoMode()) return fail("NOT_FOUND");
    const { ref } = await params;
    const { action } = await parseJson(req, z.object({ action: z.enum(["confirm", "cancel"]) }));
    // Only the buyer (or advertiser) whose order this is can confirm or cancel it.
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const [mine, myCampaign] = await Promise.all([
      prisma.order.count({ where: { gatewayRef: ref, userId: user.id } }),
      prisma.campaign.count({ where: { gatewayRef: ref, advertiserId: user.id } }),
    ]);
    if (!mine && !myCampaign) return fail("NOT_FOUND");
    const payment = await demoPaymentStore.get(ref);
    if (!payment || payment.status !== "pending") return fail("NOT_FOUND");
    await demoPaymentStore.setStatus(ref, action === "confirm" ? "paid" : "failed");
    const body = JSON.stringify({
      ref,
      event: action === "confirm" ? "payment.succeeded" : "payment.failed",
      amount_santim: payment.amountSantim,
    });
    const gateway = (await prisma.demoPayment.findUniqueOrThrow({ where: { ref } })).gateway;
    await handlePaymentWebhook(gateway, body, { [DEMO_SIGNATURE_HEADER]: signDemoWebhook(body, webhookSecret()) });
    const order = await prisma.order.findUnique({ where: { gatewayRef: ref } });
    // F7-AC3: tickets go to Telegram after the response (best effort, never fails the payment).
    if (order?.status === "paid") drainTelegramAfterResponse();
    return ok({ orderId: order?.id ?? null });
  } catch (e) {
    return handleError(e, req);
  }
}

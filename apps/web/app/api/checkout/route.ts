import { recordPhoneConsent, startCheckout } from "@dinkuan/core/server";
import { z } from "zod";
import { clickedCampaign } from "@/lib/ads";
import { fail, handleError, limitByUser, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

const schema = z.object({
  eventId: z.uuid(),
  gateway: z.enum(["telebirr", "chapa"]),
  items: z.array(z.object({ ticketTypeId: z.uuid(), qty: z.number().int().min(0).max(50) })).min(1).max(10),
  /** Optional consent to share the buyer's phone with the organiser (F11-AC2, rule 12). */
  sharePhone: z.boolean().optional(),
  accessCode: z.string().trim().max(20).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const { sharePhone, ...body } = await parseJson(req, schema);
    await limitByUser(user.id, "checkoutUser");
    const { order, checkoutUrl } = await startCheckout({ userId: user.id, ...body, campaignId: await clickedCampaign() });
    if (sharePhone !== undefined) await recordPhoneConsent(user.id, body.eventId, sharePhone);
    return ok({ orderId: order.id, checkoutUrl: checkoutUrl ?? `/orders/${order.id}` });
  } catch (e) {
    return handleError(e, req);
  }
}

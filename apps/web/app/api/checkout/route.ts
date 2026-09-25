import { startCheckout } from "@dinkuan/core/server";
import { z } from "zod";
import { fail, handleError, ok, parseJson } from "@/lib/api";
import { currentUser } from "@/lib/session";

const schema = z.object({
  eventId: z.uuid(),
  gateway: z.enum(["telebirr", "chapa"]),
  items: z.array(z.object({ ticketTypeId: z.uuid(), qty: z.number().int().min(0).max(50) })).min(1).max(10),
});

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return fail("UNAUTHENTICATED");
    const body = await parseJson(req, schema);
    const { order, checkoutUrl } = await startCheckout({ userId: user.id, ...body });
    return ok({ orderId: order.id, checkoutUrl: checkoutUrl ?? `/orders/${order.id}` });
  } catch (e) {
    return handleError(e);
  }
}

import { reconcilePendingOrders } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";

/** F5-AC8: call every 10 minutes (BullMQ repeatable job later). Protected by CRON_SECRET; Vercel Cron calls it with GET. */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return fail("FORBIDDEN");
    if (!secret && process.env.DEMO_MODE !== "true") return fail("FORBIDDEN");
    return ok(await reconcilePendingOrders());
  } catch (e) {
    return handleError(e);
  }
}

export const GET = POST;

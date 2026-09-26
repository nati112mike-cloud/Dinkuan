import { endFinishedCampaigns } from "@dinkuan/ads";
import { reconcilePendingOrders } from "@dinkuan/core/server";
import { fail, handleError, ok } from "@/lib/api";
import { runTelegramJobs } from "@/lib/telegram";

/** F5-AC8 (and F21 campaign end dates): call every 10 minutes (BullMQ repeatable job later). Protected by CRON_SECRET; Vercel Cron calls it with GET. */
export async function POST(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return fail("FORBIDDEN");
    if (!secret && process.env.DEMO_MODE !== "true") return fail("FORBIDDEN");
    const orders = await reconcilePendingOrders();
    const campaignsEnded = await endFinishedCampaigns();
    // F7-AC3/AC4: queue 24h/3h event reminders and deliver the Telegram outbox (tickets from
    // orders reconciled above included). With Redis this becomes a BullMQ repeatable job; the
    // demo has no Redis, so the cron does it. Telegram trouble never fails reconciliation.
    const telegram = await runTelegramJobs().catch((e: unknown) => {
      console.error("[telegram] cron jobs failed", e);
      return { configured: true as const, error: true };
    });
    return ok({ ...orders, campaignsEnded, telegram });
  } catch (e) {
    return handleError(e);
  }
}

export const GET = POST;

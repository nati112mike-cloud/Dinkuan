import { cronAuthorized, fail, handleError, ok } from "@/lib/api";
import { runTelegramJobs } from "@/lib/telegram";

/**
 * F7-AC3/AC4: queue event reminders (24h / 3h) and send what is waiting in the Telegram outbox.
 * Protected by CRON_SECRET like the reconcile cron. Becomes BullMQ repeatable jobs once Redis is in.
 */
export async function POST(req: Request) {
  try {
    if (!cronAuthorized(req)) return fail("FORBIDDEN");
    return ok(await runTelegramJobs());
  } catch (e) {
    return handleError(e, req);
  }
}

export const GET = POST;

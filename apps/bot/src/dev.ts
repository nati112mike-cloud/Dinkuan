/**
 * Local development: long polling instead of the webhook, plus a small loop that delivers
 * the outbox (tickets, reminders) so a demo purchase arrives in the chat without cron.
 *   pnpm --filter @dinkuan/bot dev
 * Production uses the web app's /api/telegram/webhook and /api/cron/telegram instead.
 */
import { drainOutbox, enqueueEventReminders } from "@dinkuan/core/server";
import { createBot } from "./bot";
import { createOutboxSender } from "./sender";
import { configureTelegram } from "./setup";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log("[bot] TELEGRAM_BOT_TOKEN is not set, so the bot is not running. See README > Telegram bot.");
  process.exit(0);
}

const bot = createBot(token);
const send = createOutboxSender(bot.api);

let busy = false;
async function tick(withReminders: boolean) {
  if (busy) return;
  busy = true;
  try {
    if (withReminders) await enqueueEventReminders();
    const res = await drainOutbox(send);
    if (res.sent || res.failed || res.retrying) console.log("[bot] outbox", res);
  } catch (e) {
    console.error("[bot] outbox error", e);
  } finally {
    busy = false;
  }
}

let n = 0;
const timer = setInterval(() => void tick(n++ % 30 === 0), 10_000);

await configureTelegram(bot.api, { webhookUrl: null });
const stop = () => {
  clearInterval(timer);
  void bot.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
await bot.start({ onStart: (me) => console.log(`[bot] @${me.username} is polling`) });

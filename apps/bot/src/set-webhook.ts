/**
 * Registers the production webhook:  pnpm --filter @dinkuan/bot set-webhook
 * Removes it (to use long polling): pnpm --filter @dinkuan/bot set-webhook --delete
 * Reads TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL from the environment (or the repo .env).
 */
import { Api } from "grammy";
import { configureTelegram } from "./setup";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not set.");
  process.exit(1);
}
const remove = process.argv.includes("--delete");
const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
const webhookUrl = remove ? null : `${appUrl}/api/telegram/webhook`;

const api = new Api(token);
const res = await configureTelegram(api, { webhookUrl, secret: process.env.TELEGRAM_WEBHOOK_SECRET });
const info = await api.getWebhookInfo();
console.log(res.webhookUrl ? `Webhook set to ${res.webhookUrl}` : "Webhook removed", {
  pending: info.pending_update_count,
  lastError: info.last_error_message ?? null,
});

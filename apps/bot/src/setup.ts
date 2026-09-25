import type { Api } from "grammy";
import { commandMenu } from "./bot";

export interface ConfigureResult {
  webhookUrl: string | null;
}

/**
 * Points Telegram at our webhook (with the secret it must echo back in
 * X-Telegram-Bot-Api-Secret-Token) and sets the command menu in both languages.
 * Pass webhookUrl null to remove the webhook, e.g. before local long polling.
 */
export async function configureTelegram(api: Api, opts: { webhookUrl: string | null; secret?: string }): Promise<ConfigureResult> {
  if (opts.webhookUrl) {
    if (!opts.webhookUrl.startsWith("https://")) throw new Error("Telegram webhooks must use https");
    if (!opts.secret) throw new Error("TELEGRAM_WEBHOOK_SECRET is required for the webhook");
    await api.setWebhook(opts.webhookUrl, { secret_token: opts.secret, allowed_updates: ["message", "callback_query"] });
  } else {
    await api.deleteWebhook();
  }
  // Default menu in Amharic, English for Telegram apps set to English.
  await api.setMyCommands(commandMenu("am"));
  await api.setMyCommands(commandMenu("am"), { language_code: "am" });
  await api.setMyCommands(commandMenu("en"), { language_code: "en" });
  return { webhookUrl: opts.webhookUrl };
}

import "server-only";
import { createBot, createTelegramSender, type TelegramBot } from "@dinkuan/bot";
import { drainOutbox, enqueueEventReminders, reportError } from "@dinkuan/core/server";
import { after } from "next/server";

/** The bot is optional: without TELEGRAM_BOT_TOKEN everything else works and Telegram routes answer 404. */
export function telegramToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

let botPromise: Promise<TelegramBot> | null = null;

/** One initialised bot per server process (init fetches the bot's own profile once). */
export function getBot(): Promise<TelegramBot> | null {
  const token = telegramToken();
  if (!token) return null;
  botPromise ??= (async () => {
    const bot = createBot(token);
    await bot.init();
    return bot;
  })().catch((e: unknown) => {
    botPromise = null;
    throw e;
  });
  return botPromise;
}

/** Sends what is waiting in the Telegram outbox (tickets, reminders). Null when the bot isn't configured. */
export async function drainTelegramOutbox() {
  const token = telegramToken();
  if (!token) return null;
  return drainOutbox(createTelegramSender(token));
}

/** Queues due reminders (F7-AC4), then drains the outbox. */
export async function runTelegramJobs() {
  if (!telegramToken()) return { configured: false as const };
  const reminders = await enqueueEventReminders();
  const outbox = await drainOutbox(createTelegramSender(telegramToken()!));
  return { configured: true as const, reminders, outbox };
}

/**
 * After a payment response has gone out, deliver tickets to Telegram (F7-AC3). Best effort:
 * errors are logged and never affect the payment; the cron picks up anything left over.
 */
export function drainTelegramAfterResponse() {
  if (!telegramToken()) return;
  after(async () => {
    try {
      await drainTelegramOutbox();
    } catch (e) {
      await reportError(e, { path: "telegram outbox" });
    }
  });
}

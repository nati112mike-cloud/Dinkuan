import { timingSafeEqual } from "node:crypto";
import type { TelegramBot } from "@dinkuan/bot";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { fail } from "@/lib/api";
import { getBot } from "@/lib/telegram";
import { reportError } from "@dinkuan/core/server";

type Update = Parameters<TelegramBot["handleUpdate"]>[0];

// Telegram's Update object is large; we check its envelope and let grammY route the rest.
const updateSchema = z.looseObject({ update_id: z.number().int().nonnegative() });

function secretMatches(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Telegram bot webhook (F7). Telegram sends each update here with our secret in
 * X-Telegram-Bot-Api-Secret-Token (set by `pnpm --filter @dinkuan/bot set-webhook`).
 * We answer 200 at once and handle the update after the response, so Telegram never retries
 * a slow update. 404 when the bot isn't configured.
 */
export async function POST(req: Request) {
  const bot = getBot();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!bot || !secret) return fail("NOT_FOUND");
  if (!secretMatches(req.headers.get("x-telegram-bot-api-secret-token"), secret)) return fail("FORBIDDEN");
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  // Malformed updates are acknowledged and dropped; retrying them would not help.
  if (!parsed.success) return NextResponse.json({ data: { ok: true } });
  after(async () => {
    try {
      await (await bot).handleUpdate(parsed.data as unknown as Update);
    } catch (e) {
      await reportError(e, { path: "/api/telegram/webhook" });
    }
  });
  return NextResponse.json({ data: { ok: true } });
}

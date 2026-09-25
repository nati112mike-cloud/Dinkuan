import { prisma, type User } from "@dinkuan/db";
import { normalizeEthiopianPhone } from "../phone";
import { appUrl } from "./config";
import { createSession, findOrCreateUserByPhone } from "./auth";
import { randomToken, sha256 } from "./crypto";

/** One-time sign-in links from the Telegram bot live this long (F7-AC2). */
export const TELEGRAM_LOGIN_TTL_MS = 15 * 60 * 1000;

/**
 * Only same-site relative paths may be a post-login destination: "/x" yes, "//evil.com",
 * "/\evil.com" and absolute URLs no. Returns "/" for anything else.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}

/**
 * F7-AC2: a one-time signed sign-in link, so "Buy" in Telegram opens checkout already logged in.
 * Only the token's hash is stored; the link works once and expires after 15 minutes.
 */
export async function createTelegramLoginLink(userId: string, next: string, now = new Date()): Promise<string> {
  const token = randomToken();
  await prisma.telegramLoginToken.create({
    data: { tokenHash: sha256(token), userId, expiresAt: new Date(now.getTime() + TELEGRAM_LOGIN_TTL_MS) },
  });
  const params = new URLSearchParams({ token, next: safeNextPath(next) });
  return `${appUrl()}/tg/login?${params.toString()}`;
}

/**
 * Redeems a sign-in token: it must match, be unused and be unexpired. It is marked used
 * atomically (two taps cannot both log in), then a session starts exactly like OTP login.
 * Returns null when the token is invalid, used or expired.
 */
export async function redeemTelegramLoginToken(
  token: string | null | undefined,
  now = new Date(),
): Promise<{ sessionToken: string; userId: string } | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  const claimed = await prisma.telegramLoginToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  const row = await prisma.telegramLoginToken.findUniqueOrThrow({ where: { tokenHash } });
  return { sessionToken: await createSession(row.userId, now), userId: row.userId };
}

export type LinkTelegramResult = { ok: true; user: User; isNew: boolean } | { ok: false; reason: "INVALID_PHONE" };

/**
 * Links a Telegram chat to the account for a phone number the person shared from Telegram
 * (the bot checks it is their own contact first). Creates the account the same way OTP
 * login does. A chat belongs to one account at a time, so an older link for it is cleared.
 */
export async function linkTelegramChat(rawPhone: string, chatId: string): Promise<LinkTelegramResult> {
  // Telegram sends numbers with or without the leading "+"; the helper accepts both.
  const phone = normalizeEthiopianPhone(rawPhone);
  if (!phone) return { ok: false, reason: "INVALID_PHONE" };
  const { user, isNew } = await findOrCreateUserByPhone(phone);
  const linked = await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({ where: { telegramChatId: chatId, NOT: { id: user.id } }, data: { telegramChatId: null } });
    return tx.user.update({ where: { id: user.id }, data: { telegramChatId: chatId } });
  });
  return { ok: true, user: linked, isNew };
}

export function userForTelegramChat(chatId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { telegramChatId: chatId } });
}

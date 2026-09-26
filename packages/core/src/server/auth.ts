import { prisma, type User } from "@dinkuan/db";
import { DomainError } from "../errors";
import { normalizeEthiopianPhone } from "../phone";
import { randomOtp, randomToken, sha256 } from "./crypto";
import { DEMO_OTP, demoOtpEnabled, demoStaffOtp, smsProvider } from "./sms";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_MAX_SENDS = 3;
export const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashOtp(phone: string, code: string) {
  return sha256(`${phone}:${code}`);
}

/** F1-AC2: 6-digit code, valid 5 minutes, max 3 sends per 15 minutes per number. */
export async function requestOtp(rawPhone: string, now = new Date()): Promise<{ phone: string }> {
  const phone = normalizeEthiopianPhone(rawPhone);
  if (!phone) throw new DomainError("INVALID_PHONE");
  const code = demoOtpEnabled() ? await demoCodeFor(phone) : randomOtp();
  const existing = await prisma.otpCode.findUnique({ where: { phone } });
  const windowOpen = existing && now.getTime() - existing.windowStart.getTime() < OTP_SEND_WINDOW_MS;
  if (windowOpen && existing.sendCount >= OTP_MAX_SENDS) throw new DomainError("OTP_RATE_LIMITED");
  const data = {
    codeHash: hashOtp(phone, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    // A resend inside the window keeps the wrong-code count, so resending doesn't buy more guesses.
    attempts: windowOpen ? existing.attempts : 0,
    sendCount: windowOpen ? existing.sendCount + 1 : 1,
    windowStart: windowOpen ? existing.windowStart : now,
  };
  await prisma.otpCode.upsert({ where: { phone }, create: { phone, ...data }, update: data });
  await smsProvider().send(phone, `Dinkuan code: ${code}`);
  return { phone };
}

async function demoCodeFor(phone: string) {
  const admin = await prisma.userRole.findFirst({ where: { role: "admin", user: { phone } }, select: { userId: true } });
  return admin ? demoStaffOtp() : DEMO_OTP;
}

/** F1-AC2/AC3: verify code (max 5 attempts), create the user if new, start a 30-day session. */
export async function verifyOtp(
  rawPhone: string,
  code: string,
  now = new Date(),
): Promise<{ token: string; user: User; isNew: boolean }> {
  const phone = normalizeEthiopianPhone(rawPhone);
  if (!phone) throw new DomainError("INVALID_PHONE");
  // Count the attempt first, in one statement, so parallel guesses can't all slip under the limit.
  const [otp] = await prisma.$queryRaw<{ code_hash: string; expires_at: Date }[]>`
    UPDATE otp_codes SET attempts = attempts + 1
    WHERE phone = ${phone} AND attempts < ${OTP_MAX_ATTEMPTS}
    RETURNING code_hash, expires_at`;
  if (!otp) {
    const exists = await prisma.otpCode.findUnique({ where: { phone }, select: { phone: true } });
    throw new DomainError(exists ? "OTP_TOO_MANY_ATTEMPTS" : "OTP_INVALID");
  }
  if (otp.expires_at < now) throw new DomainError("OTP_EXPIRED");
  if (otp.code_hash !== hashOtp(phone, code.trim())) throw new DomainError("OTP_INVALID");
  // Only one of two parallel correct guesses gets a session.
  const used = await prisma.otpCode.deleteMany({ where: { phone, codeHash: otp.code_hash } });
  if (used.count === 0) throw new DomainError("OTP_INVALID");
  const { user, isNew } = await findOrCreateUserByPhone(phone);
  const token = await createSession(user.id, now);
  return { token, user, isNew };
}

/** New numbers become buyers (F1-AC3). `phone` must already be normalised to E.164. */
export async function findOrCreateUserByPhone(phone: string): Promise<{ user: User; isNew: boolean }> {
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return { user: existing, isNew: false };
  try {
    const user = await prisma.user.create({ data: { phone, roles: { create: { role: "buyer" } } } });
    return { user, isNew: true };
  } catch (e) {
    // Two sign-ins for the same new number at once: the other one created it.
    const user = await prisma.user.findUnique({ where: { phone } });
    if (user) return { user, isNew: false };
    throw e;
  }
}

/** Starts a 30-day session and returns its token (only the hash is stored). */
export async function createSession(userId: string, now = new Date()): Promise<string> {
  // F22-AC5: banned accounts can't sign in again, by OTP or Telegram.
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { bannedAt: true } });
  if (u?.bannedAt) throw new DomainError("ACCOUNT_BANNED");
  const token = randomToken();
  await prisma.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
  return token;
}

export async function userForSession(token: string | undefined | null, now = new Date()) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.expiresAt < now || session.user.bannedAt) return null;
  return session.user;
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

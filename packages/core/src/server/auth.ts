import { prisma, type User } from "@dinkuan/db";
import { DomainError } from "../errors";
import { normalizeEthiopianPhone } from "../phone";
import { randomOtp, randomToken, sha256 } from "./crypto";
import { DEMO_OTP, demoOtpEnabled, smsProvider } from "./sms";

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
  const code = demoOtpEnabled() ? DEMO_OTP : randomOtp();
  const existing = await prisma.otpCode.findUnique({ where: { phone } });
  const windowOpen = existing && now.getTime() - existing.windowStart.getTime() < OTP_SEND_WINDOW_MS;
  if (windowOpen && existing.sendCount >= OTP_MAX_SENDS) throw new DomainError("OTP_RATE_LIMITED");
  const data = {
    codeHash: hashOtp(phone, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    attempts: 0,
    sendCount: windowOpen ? existing.sendCount + 1 : 1,
    windowStart: windowOpen ? existing.windowStart : now,
  };
  await prisma.otpCode.upsert({ where: { phone }, create: { phone, ...data }, update: data });
  await smsProvider().send(phone, `Dinkuan code: ${code}`);
  return { phone };
}

/** F1-AC2/AC3: verify code (max 5 attempts), create the user if new, start a 30-day session. */
export async function verifyOtp(
  rawPhone: string,
  code: string,
  now = new Date(),
): Promise<{ token: string; user: User; isNew: boolean }> {
  const phone = normalizeEthiopianPhone(rawPhone);
  if (!phone) throw new DomainError("INVALID_PHONE");
  const otp = await prisma.otpCode.findUnique({ where: { phone } });
  if (!otp) throw new DomainError("OTP_INVALID");
  if (otp.attempts >= OTP_MAX_ATTEMPTS) throw new DomainError("OTP_TOO_MANY_ATTEMPTS");
  if (otp.expiresAt < now) throw new DomainError("OTP_EXPIRED");
  if (otp.codeHash !== hashOtp(phone, code.trim())) {
    await prisma.otpCode.update({ where: { phone }, data: { attempts: { increment: 1 } } });
    throw new DomainError("OTP_INVALID");
  }
  await prisma.otpCode.delete({ where: { phone } });
  let user = await prisma.user.findUnique({ where: { phone } });
  const isNew = !user;
  if (!user) {
    user = await prisma.user.create({ data: { phone, roles: { create: { role: "buyer" } } } });
  }
  const token = randomToken();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
  });
  return { token, user, isNew };
}

export async function userForSession(token: string | undefined | null, now = new Date()) {
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { roles: true } } },
  });
  if (!session || session.expiresAt < now) return null;
  return session.user;
}

export async function logout(token: string) {
  await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
}

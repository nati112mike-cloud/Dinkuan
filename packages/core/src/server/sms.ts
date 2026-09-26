import { isDemoMode } from "./config";

/** Pluggable SMS provider (F1). Real provider is chosen once the SMS contract is signed. */
export interface SmsProvider {
  send(toE164: string, text: string): Promise<void>;
}

export class ConsoleSmsProvider implements SmsProvider {
  async send(to: string, text: string) {
    console.info(`[sms] to=${to} ${text}`);
  }
}

let provider: SmsProvider = new ConsoleSmsProvider();

export function smsProvider(): SmsProvider {
  return provider;
}

export function setSmsProvider(p: SmsProvider) {
  provider = p;
}

/** In demo mode every login code is 123456 so anyone can try the app without SMS. */
export const DEMO_OTP = "123456";

/**
 * Admin accounts in a shared demo use a separate code that only the team hands out
 * (DEMO_STAFF_CODE), so a public demo link doesn't give everyone the admin panel.
 * Without it (local dev, CI) admins use the normal demo code too.
 */
export function demoStaffOtp(): string {
  const code = process.env.DEMO_STAFF_CODE?.trim();
  return code && /^\d{6}$/.test(code) ? code : DEMO_OTP;
}

export function demoOtpEnabled(): boolean {
  return isDemoMode();
}

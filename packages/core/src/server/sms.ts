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

export function demoOtpEnabled(): boolean {
  return isDemoMode();
}

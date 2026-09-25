import { am } from "./am";
import { en } from "./en";

export type Lang = "am" | "en";
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const LANGS: Lang[] = ["am", "en"];
export const DEFAULT_LANG: Lang = "am";
export const messages: Record<Lang, Messages> = { am, en };

export function isLang(v: unknown): v is Lang {
  return v === "am" || v === "en";
}

export function t(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = messages[lang][key] ?? messages.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export function translator(lang: Lang) {
  return (key: MessageKey, vars?: Record<string, string | number>) => t(lang, key, vars);
}

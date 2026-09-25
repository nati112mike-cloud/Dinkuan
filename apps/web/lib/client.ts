import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; status: number };

/** Calls one of our JSON API routes (`{ data }` or `{ error: { code } }`). */
export async function api<T>(url: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: json.error?.code ?? "generic", status: res.status };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, code: "generic", status: 0 };
  }
}

export function errorText(lang: Lang, code: string) {
  const t = translator(lang);
  const key = `error.${code}` as MessageKey;
  return t(key) === key ? t("error.generic") : t(key);
}

export function loginUrl() {
  return `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

/** Short relative time: now, 5m, 3h, 2d, then a date. */
export function timeAgo(iso: string, lang: Lang, now = Date.now()) {
  const t = translator(lang);
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("time.now");
  if (s < 3600) return t("time.minutes", { n: Math.floor(s / 60) });
  if (s < 86400) return t("time.hours", { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t("time.days", { n: Math.floor(s / 86400) });
  return new Intl.DateTimeFormat(lang === "am" ? "am-ET" : "en-GB", { day: "numeric", month: "short", timeZone: "Africa/Addis_Ababa" }).format(
    new Date(iso),
  );
}

export function compactNumber(n: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "am" ? "am-ET" : "en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

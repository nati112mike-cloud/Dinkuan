import { ADDIS_TZ, formatBirr, formatEthiopianDate } from "@dinkuan/core";
import type { Lang } from "@dinkuan/i18n";

const locale = (lang: Lang) => (lang === "am" ? "am-ET" : "en-GB");

export function formatDay(d: Date, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: ADDIS_TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
}

export function formatTime(d: Date, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: ADDIS_TZ, hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatLongDate(d: Date, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: ADDIS_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function ethiopianDate(d: Date, lang: Lang) {
  return formatEthiopianDate(d, lang);
}

export function birr(santim: number) {
  return formatBirr(santim);
}

export function eventTitle(e: { titleAm: string | null; titleEn: string | null }, lang: Lang) {
  return (lang === "am" ? (e.titleAm ?? e.titleEn) : (e.titleEn ?? e.titleAm)) ?? "";
}

export function eventDesc(e: { descAm: string | null; descEn: string | null }, lang: Lang) {
  return (lang === "am" ? (e.descAm ?? e.descEn) : (e.descEn ?? e.descAm)) ?? "";
}

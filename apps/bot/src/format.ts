import { ADDIS_TZ, allInPrice, formatBirr, formatEthiopianDate } from "@dinkuan/core";
import { t, type Lang } from "@dinkuan/i18n";

/** Amharic readers get the Ethiopian calendar date; English readers the Gregorian one. Both in Addis time. */
export function formatDate(d: Date, lang: Lang): string {
  if (lang === "am") return formatEthiopianDate(d, "am");
  return new Intl.DateTimeFormat("en-GB", { timeZone: ADDIS_TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
}

export function formatTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "am" ? "am-ET" : "en-GB", {
    timeZone: ADDIS_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function eventTitle(e: { titleAm: string | null; titleEn: string | null }, lang: Lang): string {
  return (lang === "am" ? (e.titleAm ?? e.titleEn) : (e.titleEn ?? e.titleAm)) ?? "";
}

interface PricedEvent {
  feePctBps: number;
  feeFixedSantim: number;
  ticketTypes: { priceSantim: number; visibility: string; capacity: number; sold: number; reserved: number }[];
}

/** "From 520 Br" with the all-in price of the cheapest public tier, as on the web event card. */
export function priceLine(e: PricedEvent, lang: Lang): string {
  const publicTypes = e.ticketTypes.filter((tt) => tt.visibility === "public");
  if (publicTypes.length && publicTypes.every((tt) => tt.sold + tt.reserved >= tt.capacity)) return t(lang, "event.soldOut");
  if (!publicTypes.length) return "";
  const min = Math.min(...publicTypes.map((tt) => tt.priceSantim));
  if (min === 0) return t(lang, "event.free");
  return t(lang, "event.from", { price: formatBirr(allInPrice(min, e)) });
}

/** Poster URLs are stored relative (e.g. /posters/<slug>); Telegram needs an absolute one. */
export function absoluteUrl(path: string, appUrl: string): string {
  return /^https?:\/\//.test(path) ? path : `${appUrl.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

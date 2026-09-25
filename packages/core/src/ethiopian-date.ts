/**
 * Ethiopian (Ge'ez) calendar conversion via Julian Day Numbers.
 * The Ethiopian year has 12 months of 30 days plus Pagume (5 days, 6 in leap years).
 */
const ETHIOPIAN_EPOCH_JDN = 1724221; // Meskerem 1, 1 E.C. (Amete Mihret)

export interface EthiopianDate {
  year: number;
  month: number; // 1..13
  day: number; // 1..30
}

export const ETHIOPIAN_MONTHS = {
  am: ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"],
  en: ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"],
} as const;

function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  );
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export function ethiopianToJdn({ year, month, day }: EthiopianDate): number {
  return ETHIOPIAN_EPOCH_JDN - 1 + 365 * (year - 1) + Math.floor(year / 4) + 30 * (month - 1) + day;
}

/** Beyene-Kudlek: count 4-year cycles from year 0 so the leap year (y % 4 === 3) ends each cycle. */
const CYCLE_START_JDN = ETHIOPIAN_EPOCH_JDN - 365;

export function jdnToEthiopian(jdn: number): EthiopianDate {
  const r = (jdn - CYCLE_START_JDN) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const year = 4 * Math.floor((jdn - CYCLE_START_JDN) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  return { year, month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

export function gregorianToEthiopian(year: number, month: number, day: number): EthiopianDate {
  return jdnToEthiopian(gregorianToJdn(year, month, day));
}

export function ethiopianToGregorian(date: EthiopianDate): { year: number; month: number; day: number } {
  return jdnToGregorian(ethiopianToJdn(date));
}

export const ADDIS_TZ = "Africa/Addis_Ababa";

/** Calendar date of a UTC instant as seen in Addis Ababa. */
export function addisCalendarDate(instant: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ADDIS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function formatEthiopianDate(instant: Date, lang: "am" | "en"): string {
  const g = addisCalendarDate(instant);
  const e = gregorianToEthiopian(g.year, g.month, g.day);
  const month = ETHIOPIAN_MONTHS[lang][e.month - 1];
  return lang === "am" ? `${month} ${e.day}፣ ${e.year} ዓ.ም.` : `${month} ${e.day}, ${e.year} E.C.`;
}

import { ADDIS_TZ } from "./ethiopian-date";

/** F22-AC8: 13+ for general use, 18+ for nightlife content and gifting. */
export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export type AgeGroup = "adult" | "teen" | "child" | "unknown";

/** Today's calendar date in Addis Ababa, as `YYYY-MM-DD`. */
function addisToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ADDIS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Whole years old on `now` (Addis Ababa date). `birthDate` is a calendar date: a `YYYY-MM-DD`
 * string or a Date at UTC midnight (how Postgres DATE columns come back).
 */
export function ageOn(birthDate: Date | string, now = new Date()): number {
  const born = typeof birthDate === "string" ? birthDate.slice(0, 10) : birthDate.toISOString().slice(0, 10);
  const [by, bm, bd] = born.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = addisToday(now).split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** Accounts made before birth dates were asked for count as `unknown` and are treated as not adults. */
export function ageGroup(birthDate: Date | string | null | undefined, now = new Date()): AgeGroup {
  if (!birthDate) return "unknown";
  const age = ageOn(birthDate, now);
  if (age >= ADULT_AGE) return "adult";
  if (age >= MIN_AGE) return "teen";
  return "child";
}

export const isAdult = (birthDate: Date | string | null | undefined, now = new Date()) => ageGroup(birthDate, now) === "adult";

/** A plausible birth date: a real calendar date, not in the future and not over 120 years ago. */
export function validBirthDate(value: string, now = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return false;
  const age = ageOn(value, now);
  return age >= 0 && age <= 120;
}

/** F22-AC8: events in these categories are 18+ (tickets, and hidden from teens in discovery). */
export const ADULT_CATEGORIES = ["nightlife"] as const;
export const isAdultCategory = (category: string) => (ADULT_CATEGORIES as readonly string[]).includes(category);

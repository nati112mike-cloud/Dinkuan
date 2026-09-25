import { addisCalendarDate } from "./ethiopian-date";

/**
 * Shared notion of "tonight", "this weekend" and friends, used by the web home page and
 * event list (F4) and by the Telegram bot's /tonight and /weekend (F7). All in Addis time.
 */
export type EventDateFilter = "today" | "weekend" | "week" | "date";

/** Midnight in Addis `days` from the Addis date of `now`, as a UTC instant. */
function addisMidnight(now: Date, days: number): Date {
  const { year, month, day } = addisCalendarDate(now);
  return new Date(Date.UTC(year, month - 1, day + days, -3));
}

function addisWeekday(now: Date): number {
  const { year, month, day } = addisCalendarDate(now);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function eventDateRange(filter: string | undefined, now = new Date(), pick?: string): { from: Date; to?: Date } {
  switch (filter) {
    case "today":
      return { from: now, to: addisMidnight(now, 1) };
    case "weekend": {
      // Friday evening to Sunday night
      const wd = addisWeekday(now);
      const toFri = (5 - wd + 7) % 7;
      const start = wd === 0 || wd === 6 ? now : new Date(addisMidnight(now, toFri).getTime() + 17 * 3600_000);
      const toMon = (8 - wd) % 7 || 7;
      return { from: start < now ? now : start, to: addisMidnight(now, toMon) };
    }
    case "week":
      return { from: now, to: addisMidnight(now, 7) };
    case "date": {
      if (!pick || !/^\d{4}-\d{2}-\d{2}$/.test(pick)) return { from: now };
      const [y, m, d] = pick.split("-").map(Number) as [number, number, number];
      const from = new Date(Date.UTC(y, m - 1, d, -3));
      return { from, to: new Date(from.getTime() + 86400_000) };
    }
    default:
      return { from: now };
  }
}

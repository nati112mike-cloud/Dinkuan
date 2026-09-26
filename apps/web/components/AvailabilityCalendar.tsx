import { translator, type Lang } from "@dinkuan/i18n";

/** Month grids with blocked and booked dates crossed out (F20-AC5). Dates are YYYY-MM-DD. */
export function AvailabilityCalendar({
  lang,
  today,
  months = 2,
  unavailable,
  selected,
  hrefFor,
}: {
  lang: Lang;
  today: string;
  months?: number;
  unavailable: { date: string; reason: string }[];
  selected?: Set<string>;
  hrefFor?: (date: string) => string;
}) {
  const t = translator(lang);
  const off = new Map(unavailable.map((u) => [u.date, u.reason]));
  const [y, m] = today.split("-").map(Number) as [number, number];
  const locale = lang === "am" ? "am-ET" : "en-GB";
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: months }, (_, k) => {
        const first = new Date(Date.UTC(y, m - 1 + k, 1));
        const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
        const lead = (first.getUTCDay() + 6) % 7; // Monday first
        return (
          <div key={k} className="rounded-2xl bg-white p-3 ring-1 ring-tent-100">
            <p className="mb-2 text-center font-bold">
              {new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}
            </p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {weekdays.map((w, i) => (
                <span key={i} className="font-semibold text-stone-400">
                  {w}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`x${i}`} />
              ))}
              {Array.from({ length: daysIn }, (_, i) => {
                const iso = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1)).toISOString().slice(0, 10);
                const reason = off.get(iso);
                const past = iso < today;
                const isSel = selected?.has(iso);
                const cls = `grid h-9 place-items-center rounded-lg ${
                  isSel ? "bg-tent-600 font-bold text-white" : reason === "booked" ? "bg-stone-800 text-white line-through" : reason ? "bg-stone-200 text-stone-400 line-through" : past ? "text-stone-300" : "bg-emerald-50 text-emerald-800"
                }`;
                const label = `${iso} ${reason ? t(reason === "booked" ? "cal.booked" : "cal.blocked") : past ? "" : t("cal.free")}`;
                return hrefFor && !past ? (
                  <a key={iso} href={hrefFor(iso)} className={cls} aria-label={label}>
                    {i + 1}
                  </a>
                ) : (
                  <span key={iso} className={cls} aria-label={label} title={label}>
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="flex flex-wrap gap-3 text-xs text-stone-500 sm:col-span-2">
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-emerald-100 align-middle" /> {t("cal.free")}
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-stone-200 align-middle" /> {t("cal.blocked")}
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-stone-800 align-middle" /> {t("cal.booked")}
        </span>
      </p>
    </div>
  );
}

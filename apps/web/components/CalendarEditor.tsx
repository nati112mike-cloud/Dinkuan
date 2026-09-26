"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

/** Tap a free date to block it, tap a blocked date to free it. Booked dates can't be changed here. */
export function CalendarEditor({ lang, today, initial }: { lang: Lang; today: string; initial: { date: string; reason: string }[] }) {
  const t = translator(lang);
  const [off, setOff] = useState(() => new Map(initial.map((u) => [u.date, u.reason])));
  const [error, setError] = useState<string | null>(null);
  const [y, m] = today.split("-").map(Number) as [number, number];
  const locale = lang === "am" ? "am-ET" : "en-GB";

  const toggle = async (iso: string) => {
    const reason = off.get(iso);
    if (reason === "booked") return;
    const block = !reason;
    setOff((prev) => {
      const next = new Map(prev);
      if (block) next.set(iso, "blocked");
      else next.delete(iso);
      return next;
    });
    const r = await api("/api/vendor/availability", { body: block ? { block: [iso] } : { unblock: [iso] } });
    if (!r.ok) setError(errorText(lang, r.code));
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {[0, 1, 2].map((k) => {
        const first = new Date(Date.UTC(y, m - 1 + k, 1));
        const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
        const lead = (first.getUTCDay() + 6) % 7;
        return (
          <div key={k} className="rounded-2xl bg-white p-3 ring-1 ring-tent-100">
            <p className="mb-2 text-center font-bold">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</p>
            <div className="grid grid-cols-7 gap-1 text-center text-sm">
              {Array.from({ length: lead }, (_, i) => (
                <span key={`x${i}`} />
              ))}
              {Array.from({ length: daysIn }, (_, i) => {
                const iso = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1)).toISOString().slice(0, 10);
                const reason = off.get(iso);
                const past = iso < today;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={past || reason === "booked"}
                    aria-pressed={!!reason}
                    aria-label={iso}
                    onClick={() => void toggle(iso)}
                    className={`h-10 rounded-lg ${
                      reason === "booked" ? "bg-stone-800 text-white" : reason ? "bg-stone-300 text-stone-600 line-through" : past ? "text-stone-300" : "bg-emerald-50 text-emerald-800"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="flex flex-wrap gap-3 text-xs text-stone-500">
        <span>🟩 {t("cal.free")}</span>
        <span>⬜ {t("cal.blocked")}</span>
        <span>⬛ {t("cal.booked")}</span>
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

/** F12-AC2: an admin overrides the platform fee for one event (percent and fixed Birr per ticket). */
export function FeeForm({ lang, eventId, pctBps, fixedSantim }: { lang: Lang; eventId: string; pctBps: number; fixedSantim: number }) {
  const t = translator(lang);
  const router = useRouter();
  const [pct, setPct] = useState(String(pctBps / 100));
  const [fixed, setFixed] = useState(String(fixedSantim / 100));
  const [msg, setMsg] = useState<string | null>(null);
  const field = "tap w-20 rounded-xl border border-tent-200 bg-white px-2 text-sm";
  return (
    <form
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        // Whole basis points and santim; the inputs allow at most two decimals.
        const r = await api(`/api/admin/events/${eventId}/fee`, {
          body: { feePctBps: Math.round(Number(pct) * 100), feeFixedSantim: Math.round(Number(fixed) * 100) },
        });
        setMsg(r.ok ? t("adminEvents.saved") : errorText(lang, r.code));
        if (r.ok) router.refresh();
      }}
    >
      <label className="flex items-center gap-1">
        <input inputMode="decimal" pattern="\d{1,2}(\.\d{1,2})?" value={pct} onChange={(e) => setPct(e.target.value)} className={field} aria-label={t("adminEvents.feePct")} />%
      </label>
      <label className="flex items-center gap-1">
        +<input inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" value={fixed} onChange={(e) => setFixed(e.target.value)} className={field} aria-label={t("adminEvents.feeFixed")} />
        {t("common.birr")}
      </label>
      <button type="submit" className="tap rounded-xl bg-white px-3 font-bold ring-1 ring-tent-200">
        {t("adminEvents.saveFee")}
      </button>
      {msg && <span className="text-xs text-stone-500">{msg}</span>}
    </form>
  );
}

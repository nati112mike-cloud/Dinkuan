"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBirr } from "@dinkuan/core";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

const EVENT_TYPES = ["wedding", "birthday", "corporate", "club", "graduation", "other"] as const;

/** F20-AC14: date, time, venue, type, guests, budget and notes. */
export function RequestForm({
  lang,
  vendorId,
  today,
  unavailable,
  packages,
  initialDate,
  initialPackage,
}: {
  lang: Lang;
  vendorId: string;
  today: string;
  unavailable: string[];
  packages: { id: string; tier: string; name: string; priceSantim: number }[];
  initialDate: string;
  initialPackage: string;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("18:00");
  const [venue, setVenue] = useState("");
  const [eventType, setEventType] = useState<(typeof EVENT_TYPES)[number]>("wedding");
  const [guests, setGuests] = useState("150");
  const [budget, setBudget] = useState("");
  const [packageId, setPackageId] = useState(initialPackage);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const taken = date !== "" && unavailable.includes(date);
  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";
  const label = "block space-y-1 text-sm font-semibold";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        const r = await api<{ conversationId: string }>("/api/requests", {
          body: {
            vendorId,
            packageId: packageId || null,
            eventDate: date,
            startTime: time,
            venue,
            eventType: t(`request.type.${eventType}` as MessageKey),
            guests: Number(guests),
            budgetSantim: budget ? Number(budget) * 100 : null,
            notes,
          },
        });
        if (r.ok) router.push(`/inbox/${r.data.conversationId}`);
        else {
          setError(errorText(lang, r.code));
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("request.date")}
          <input type="date" required min={today} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
        </label>
        <label className={label}>
          {t("request.time")}
          <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </label>
      </div>
      {taken && <p className="rounded-xl bg-amber-50 p-2 text-sm text-amber-800">{t("error.DATE_UNAVAILABLE")}</p>}
      {date && !taken && <p className="text-sm font-semibold text-emerald-700">✓ {t("hire.availableOnDate")}</p>}
      <label className={label}>
        {t("request.venue")}
        <input required minLength={2} maxLength={120} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Hilton Addis" className={field} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("request.eventType")}
          <select value={eventType} onChange={(e) => setEventType(e.target.value as (typeof EVENT_TYPES)[number])} className={field}>
            {EVENT_TYPES.map((k) => (
              <option key={k} value={k}>
                {t(`request.type.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("request.guests")}
          <input type="number" required min={1} max={20000} value={guests} onChange={(e) => setGuests(e.target.value)} className={field} />
        </label>
      </div>
      {packages.length > 0 && (
        <label className={label}>
          {t("request.package")}
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)} className={field}>
            <option value="">{t("request.noPackage")}</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {t(`tier.${p.tier}` as MessageKey)} · {p.name} · {formatBirr(p.priceSantim)} {t("common.birr")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={label}>
        {t("request.budget")}
        <input inputMode="numeric" pattern="\d*" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder="25000" className={field} />
      </label>
      <label className={label}>
        {t("request.notes")}
        <textarea value={notes} maxLength={1000} rows={4} onChange={(e) => setNotes(e.target.value)} placeholder={t("request.notesPlaceholder")} className="w-full rounded-xl border border-tent-200 p-3" />
      </label>
      <p className="rounded-xl bg-tent-100 p-3 text-xs text-tent-800">🔒 {t("chat.maskNotice")}</p>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={busy || taken} className="tap w-full rounded-2xl bg-tent-600 py-3 text-lg font-bold text-white disabled:opacity-50">
        {t("request.send")}
      </button>
    </form>
  );
}

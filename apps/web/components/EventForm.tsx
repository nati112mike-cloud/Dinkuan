"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { fromAddisInput } from "@/lib/addis-time";
import { api, errorText } from "@/lib/client";
import { compressImage, uploadResumable } from "@/lib/upload";

export type EventFormValues = {
  titleAm: string;
  titleEn: string;
  descAm: string;
  descEn: string;
  category: string;
  venueId: string;
  startsAt: string;
  endsAt: string;
  posterUrl: string | null;
  lineup: string;
};

type Venue = { id: string; name: string };

const EMPTY: EventFormValues = {
  titleAm: "",
  titleEn: "",
  descAm: "",
  descEn: "",
  category: "nightlife",
  venueId: "",
  startsAt: "",
  endsAt: "",
  posterUrl: null,
  lineup: "",
};

/** F3 wizard step 1: title and description in Amharic and/or English, category, venue, dates, poster. */
export function EventForm({
  lang,
  organiserId,
  eventId,
  initial,
  venues,
  categories,
}: {
  lang: Lang;
  organiserId: string;
  eventId?: string;
  initial?: EventFormValues;
  venues: Venue[];
  categories: readonly string[];
}) {
  const t = translator(lang);
  const router = useRouter();
  const [v, setV] = useState<EventFormValues>(initial ?? { ...EMPTY, venueId: venues[0]?.id ?? "" });
  const [newVenue, setNewVenue] = useState({ name: "", address: "", lat: "9.0108", lng: "38.7613" });
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof EventFormValues>(k: K, value: EventFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";
  const label = "block space-y-1 text-sm font-semibold";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy("save");
        const body = {
          organiserId,
          titleAm: v.titleAm,
          titleEn: v.titleEn,
          descAm: v.descAm,
          descEn: v.descEn,
          category: v.category,
          venueId: v.venueId || null,
          venue: v.venueId ? null : { name: newVenue.name, address: newVenue.address, lat: Number(newVenue.lat), lng: Number(newVenue.lng) },
          startsAt: fromAddisInput(v.startsAt),
          endsAt: fromAddisInput(v.endsAt),
          posterUrl: v.posterUrl,
          lineup: v.lineup
            .split(/[,\n]/)
            .map((x) => x.trim())
            .filter(Boolean),
        };
        const r = eventId
          ? await api<{ id: string }>(`/api/organiser/events/${eventId}`, { method: "PUT", body })
          : await api<{ id: string }>("/api/organiser/events", { body });
        setBusy(null);
        if (r.ok) {
          router.push(eventId ? `/organiser/events/${eventId}` : `/organiser/events/${r.data.id}/tickets`);
          router.refresh();
        } else setError(errorText(lang, r.code));
      }}
    >
      <p className="text-xs text-stone-500">{t("eventForm.titleHint")}</p>
      <label className={label}>
        {t("eventForm.titleAm")}
        <input lang="am" maxLength={120} value={v.titleAm} onChange={(e) => set("titleAm", e.target.value)} className={field} />
      </label>
      <label className={label}>
        {t("eventForm.titleEn")}
        <input maxLength={120} value={v.titleEn} onChange={(e) => set("titleEn", e.target.value)} className={field} />
      </label>
      <label className={label}>
        {t("eventForm.descAm")}
        <textarea lang="am" rows={3} maxLength={4000} value={v.descAm} onChange={(e) => set("descAm", e.target.value)} className="w-full rounded-xl border border-tent-200 p-3" />
      </label>
      <label className={label}>
        {t("eventForm.descEn")}
        <textarea rows={3} maxLength={4000} value={v.descEn} onChange={(e) => set("descEn", e.target.value)} className="w-full rounded-xl border border-tent-200 p-3" />
      </label>
      <label className={label}>
        {t("eventForm.category")}
        <select value={v.category} onChange={(e) => set("category", e.target.value)} className={field}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {t(`category.${c}` as MessageKey)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        {t("eventForm.venue")}
        <select value={v.venueId} onChange={(e) => set("venueId", e.target.value)} className={field} data-testid="venue-select">
          {venues.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
          <option value="">{t("eventForm.newVenue")}</option>
        </select>
      </label>
      {!v.venueId && (
        <div className="space-y-2 rounded-2xl bg-tent-50 p-3">
          <input required minLength={2} placeholder={t("eventForm.venueName")} aria-label={t("eventForm.venueName")} value={newVenue.name} onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })} className={field} />
          <input required minLength={2} placeholder={t("eventForm.venueAddress")} aria-label={t("eventForm.venueAddress")} value={newVenue.address} onChange={(e) => setNewVenue({ ...newVenue, address: e.target.value })} className={field} />
          <div className="grid grid-cols-2 gap-2">
            <input required inputMode="decimal" aria-label={t("eventForm.lat")} value={newVenue.lat} onChange={(e) => setNewVenue({ ...newVenue, lat: e.target.value })} className={field} />
            <input required inputMode="decimal" aria-label={t("eventForm.lng")} value={newVenue.lng} onChange={(e) => setNewVenue({ ...newVenue, lng: e.target.value })} className={field} />
          </div>
          <p className="text-xs text-stone-500">{t("eventForm.pinHint")}</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={label}>
          {t("eventForm.starts")}
          <input required type="datetime-local" value={v.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={field} />
        </label>
        <label className={label}>
          {t("eventForm.ends")}
          <input type="datetime-local" value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={field} />
        </label>
      </div>
      <label className={label}>
        {t("eventForm.lineup")}
        <input value={v.lineup} onChange={(e) => set("lineup", e.target.value)} placeholder={t("eventForm.lineupHint")} className={field} />
      </label>
      <div className="space-y-2">
        <span className="block text-sm font-semibold">{t("eventForm.poster")}</span>
        {v.posterUrl && <img src={v.posterUrl} alt="" className="h-40 w-32 rounded-xl object-cover" />}
        <input
          type="file"
          accept="image/*"
          aria-label={t("eventForm.poster")}
          className="block w-full text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy("upload");
            setError(null);
            try {
              const p = await compressImage(f, 1600);
              set("posterUrl", `/api/media/${await uploadResumable(p.blob, p.contentType, () => undefined, () => undefined)}`);
            } catch {
              setError(t("error.UPLOAD_INCOMPLETE"));
            }
            setBusy(null);
          }}
        />
        <p className="text-xs text-stone-500">{v.posterUrl ? "" : t("eventForm.posterGenerated")}</p>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={!!busy} className="tap w-full rounded-xl bg-tent-700 font-bold text-white disabled:opacity-50">
        {busy === "upload" ? t("organiser.uploading") : busy === "save" ? t("organiser.saving") : t(eventId ? "eventForm.save" : "eventForm.next")}
      </button>
    </form>
  );
}

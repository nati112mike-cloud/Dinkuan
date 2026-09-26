"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";
import { compressImage, uploadResumable } from "@/lib/upload";

export type OrganiserFormValues = {
  type: "business" | "individual";
  name: string;
  tin: string;
  licenceUrl: string | null;
  payoutMethod: "telebirr" | "bank";
  payoutAccount: string;
};

const EMPTY: OrganiserFormValues = { type: "business", name: "", tin: "", licenceUrl: null, payoutMethod: "telebirr", payoutAccount: "" };

/** F2-AC1/AC2: apply as a business (TIN and trade licence, reviewed) or an individual (free events). */
export function OrganiserForm({ lang, initial }: { lang: Lang; initial: OrganiserFormValues | null }) {
  const t = translator(lang);
  const router = useRouter();
  const [v, setV] = useState<OrganiserFormValues>(initial ?? EMPTY);
  const [busy, setBusy] = useState<null | "upload" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof OrganiserFormValues>(k: K, value: OrganiserFormValues[K]) => setV((p) => ({ ...p, [k]: value }));
  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";
  const label = "block space-y-1 text-sm font-semibold";
  const chip = (on: boolean) => `tap flex-1 rounded-xl px-3 text-sm font-bold ring-1 ${on ? "bg-tent-600 text-white ring-tent-600" : "bg-white ring-tent-200"}`;

  const save = async (submit: boolean) => {
    setError(null);
    setBusy("save");
    const r = await api("/api/organiser", {
      method: "PUT",
      body: { ...v, tin: v.type === "business" && v.tin ? v.tin : null, licenceUrl: v.type === "business" ? v.licenceUrl : null, submit },
    });
    setBusy(null);
    if (r.ok) router.refresh();
    else setError(errorText(lang, r.code));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("organiser.type")}</legend>
        <div className="flex gap-2">
          {(["business", "individual"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={v.type === k} className={chip(v.type === k)} onClick={() => set("type", k)}>
              {t(k === "business" ? "organiser.business" : "organiser.individual")}
            </button>
          ))}
        </div>
        <p className="text-xs text-stone-500">{t(v.type === "business" ? "organiser.businessHint" : "organiser.individualHint")}</p>
      </fieldset>
      <label className={label}>
        {t("organiser.name")}
        <input required minLength={2} maxLength={80} value={v.name} onChange={(e) => set("name", e.target.value)} className={field} />
      </label>
      {v.type === "business" && (
        <>
          <label className={label}>
            {t("organiser.tin")}
            <input inputMode="numeric" pattern="\d{10}" maxLength={10} value={v.tin} onChange={(e) => set("tin", e.target.value.replace(/\D/g, ""))} className={field} />
          </label>
          <label className={label}>
            {t("organiser.licence")}
            <input
              type="file"
              accept="image/*"
              className="block w-full text-sm"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy("upload");
                setError(null);
                try {
                  const p = await compressImage(f);
                  const id = await uploadResumable(p.blob, p.contentType, () => undefined, () => undefined);
                  set("licenceUrl", `/api/media/${id}`);
                } catch {
                  setError(t("error.UPLOAD_INCOMPLETE"));
                }
                setBusy(null);
              }}
            />
            {v.licenceUrl && <span className="block text-xs font-semibold text-emerald-700">✓ {t("organiser.licenceUploaded")}</span>}
          </label>
        </>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("organiser.payout")}</legend>
        <div className="flex gap-2">
          {(["telebirr", "bank"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={v.payoutMethod === k} className={chip(v.payoutMethod === k)} onClick={() => set("payoutMethod", k)}>
              {t(k === "telebirr" ? "organiser.telebirr" : "organiser.bank")}
            </button>
          ))}
        </div>
        <input
          required
          minLength={5}
          maxLength={60}
          aria-label={t("organiser.payoutAccount")}
          placeholder={t(v.payoutMethod === "telebirr" ? "organiser.telebirrPlaceholder" : "organiser.bankPlaceholder")}
          value={v.payoutAccount}
          onChange={(e) => set("payoutAccount", e.target.value)}
          className={field}
        />
        <p className="text-xs text-stone-500">{t("organiser.holdHint")}</p>
      </fieldset>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={!!busy} onClick={() => void save(false)} className="tap flex-1 rounded-xl bg-white font-bold ring-1 ring-tent-200 disabled:opacity-50">
          {t("organiser.saveDraft")}
        </button>
        <button type="submit" disabled={!!busy} className="tap flex-1 rounded-xl bg-tent-700 font-bold text-white disabled:opacity-50">
          {busy === "save" ? t("organiser.saving") : t("organiser.submit")}
        </button>
      </div>
    </form>
  );
}

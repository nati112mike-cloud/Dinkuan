"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { AREAS, LANGUAGES, VENDOR_TYPE_ICON, VENDOR_TYPES } from "@dinkuan/marketplace/text";
import { api, errorText } from "@/lib/client";
import { compressImage, uploadResumable } from "@/lib/upload";

export type VendorFormValues = {
  types: string[];
  headline: string;
  about: string;
  yearsExperience: number;
  services: string[];
  genres: string[];
  languages: string[];
  areas: string[];
  equipment: string[];
  teamSize: number;
  socialLinks: string[];
  coverUrl: string | null;
};

const EMPTY: VendorFormValues = {
  types: [],
  headline: "",
  about: "",
  yearsExperience: 1,
  services: [],
  genres: [],
  languages: ["Amharic"],
  areas: [],
  equipment: [],
  teamSize: 1,
  socialLinks: [],
  coverUrl: null,
};

const splitList = (s: string) =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** F20-AC1: the pro profile fields on top of the social profile. */
export function VendorForm({ lang, initial }: { lang: Lang; initial: VendorFormValues | null }) {
  const t = translator(lang);
  const router = useRouter();
  const [v, setV] = useState<VendorFormValues>(initial ?? EMPTY);
  const [lists, setLists] = useState({
    services: v.services.join(", "),
    genres: v.genres.join(", "),
    equipment: v.equipment.join("\n"),
    socialLinks: v.socialLinks.join("\n"),
  });
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof VendorFormValues>(k: K, value: VendorFormValues[K]) => {
    setV((p) => ({ ...p, [k]: value }));
    setState("idle");
  };
  const toggleIn = (k: "types" | "languages" | "areas", item: string, max: number) =>
    set(k, v[k].includes(item) ? v[k].filter((x) => x !== item) : v[k].length < max ? [...v[k], item] : v[k]);

  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";
  const label = "block space-y-1 text-sm font-semibold";
  const chip = (on: boolean) => `tap rounded-full px-3 text-sm font-semibold ring-1 ${on ? "bg-tent-600 text-white ring-tent-600" : "bg-white ring-tent-200"}`;

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setState("saving");
        const body = {
          ...v,
          about: v.about || undefined,
          services: splitList(lists.services),
          genres: splitList(lists.genres),
          equipment: splitList(lists.equipment),
          socialLinks: splitList(lists.socialLinks),
        };
        const r = await api("/api/vendor", { method: "PUT", body });
        if (r.ok) {
          setState("saved");
          router.push(initial ? "/vendor" : "/vendor/packages");
          router.refresh();
        } else {
          setError(errorText(lang, r.code));
          setState("idle");
        }
      }}
    >
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("vendorForm.types")}</legend>
        <div className="flex flex-wrap gap-2">
          {VENDOR_TYPES.map((k) => (
            <button key={k} type="button" aria-pressed={v.types.includes(k)} onClick={() => toggleIn("types", k, 3)} className={chip(v.types.includes(k))}>
              {VENDOR_TYPE_ICON[k]} {t(`vendorType.${k}` as MessageKey)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        {t("vendorForm.headline")}
        <input required minLength={3} maxLength={80} value={v.headline} onChange={(e) => set("headline", e.target.value)} placeholder={t("vendorForm.headlinePlaceholder")} className={field} />
      </label>
      <label className={label}>
        {t("vendor.about")}
        <textarea value={v.about} maxLength={1000} rows={4} onChange={(e) => set("about", e.target.value)} className="w-full rounded-xl border border-tent-200 p-3" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("vendor.experience")}
          <input type="number" min={0} max={60} value={v.yearsExperience} onChange={(e) => set("yearsExperience", Number(e.target.value))} className={field} />
        </label>
        <label className={label}>
          {t("vendor.teamSize")}
          <input type="number" min={1} max={200} value={v.teamSize} onChange={(e) => set("teamSize", Number(e.target.value))} className={field} />
        </label>
      </div>
      <label className={label}>
        {t("vendor.services")}
        <input value={lists.services} onChange={(e) => setLists((l) => ({ ...l, services: e.target.value }))} placeholder={t("vendorForm.servicesPlaceholder")} className={field} />
      </label>
      <label className={label}>
        {t("vendor.genres")}
        <input value={lists.genres} onChange={(e) => setLists((l) => ({ ...l, genres: e.target.value }))} placeholder="Afro-house, Amapiano, Ethio-jazz" className={field} />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("vendor.languages")}</legend>
        <div className="flex flex-wrap gap-2">
          {LANGUAGES.map((l) => (
            <button key={l} type="button" aria-pressed={v.languages.includes(l)} onClick={() => toggleIn("languages", l, 6)} className={chip(v.languages.includes(l))}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("vendor.areas")}</legend>
        <div className="flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <button key={a} type="button" aria-pressed={v.areas.includes(a)} onClick={() => toggleIn("areas", a, 11)} className={chip(v.areas.includes(a))}>
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <label className={label}>
        {t("vendor.equipment")}
        <textarea value={lists.equipment} rows={3} onChange={(e) => setLists((l) => ({ ...l, equipment: e.target.value }))} placeholder={t("vendorForm.onePerLine")} className="w-full rounded-xl border border-tent-200 p-3" />
      </label>
      <label className={label}>
        {t("vendorForm.links")}
        <textarea value={lists.socialLinks} rows={2} onChange={(e) => setLists((l) => ({ ...l, socialLinks: e.target.value }))} placeholder="https://" className="w-full rounded-xl border border-tent-200 p-3" />
      </label>
      <label className="tap grid cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-tent-200 bg-white p-4 text-center font-semibold text-tent-700">
        {v.coverUrl ? <img src={v.coverUrl} alt="" className="max-h-32 rounded-xl" /> : `🖼 ${t("vendorForm.cover")}`}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const p = await compressImage(f, 1600);
            const id = await uploadResumable(p.blob, p.contentType, () => undefined, () => undefined);
            set("coverUrl", `/api/media/${id}`);
          }}
        />
      </label>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={state === "saving" || v.types.length === 0} className="tap w-full rounded-2xl bg-tent-600 py-3 font-bold text-white disabled:opacity-50">
        {state === "saved" ? `✓ ${t("settings.saved")}` : initial ? t("settings.save") : t("vendorForm.create")}
      </button>
    </form>
  );
}

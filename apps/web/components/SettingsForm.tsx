"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";
import { compressImage, uploadResumable } from "@/lib/upload";

export type SettingsValues = {
  username: string;
  displayName: string;
  bio: string;
  link: string;
  subCity: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPrivate: boolean;
  showEvents: boolean;
  lowDataMode: boolean;
  creatorMode: boolean;
  hiddenWords: string[];
};

/** F14-AC1 profile fields, F14-AC4 private account, F16-AC8 low-data mode, F16-AC3 keyword filter. */
export function SettingsForm({ lang, initial }: { lang: Lang; initial: SettingsValues }) {
  const t = translator(lang);
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [words, setWords] = useState(initial.hiddenWords.join(", "));
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const set = <K extends keyof SettingsValues>(k: K, value: SettingsValues[K]) => {
    setV((prev) => ({ ...prev, [k]: value }));
    setState("idle");
  };

  const uploadPhoto = async (file: File | undefined, key: "avatarUrl" | "coverUrl") => {
    if (!file) return;
    setState("saving");
    try {
      const p = await compressImage(file, key === "avatarUrl" ? 480 : 1600);
      const id = await uploadResumable(p.blob, p.contentType, () => undefined, () => undefined);
      set(key, `/api/media/${id}`);
    } catch (e) {
      setState(errorText(lang, (e as { code?: string }).code ?? "generic"));
    }
  };

  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";
  const toggle = (k: "isPrivate" | "showEvents" | "lowDataMode" | "creatorMode", label: string, hint?: string) => (
    <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-tent-100">
      <input type="checkbox" checked={v[k]} onChange={(e) => set(k, e.target.checked)} className="mt-1 h-5 w-5 accent-tent-600" />
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-stone-500">{hint}</span>}
      </span>
    </label>
  );

  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("saving");
        const hiddenWords = words
          .split(",")
          .map((w) => w.trim())
          .filter(Boolean);
        const r = await api<{ username: string }>("/api/profile", { method: "PATCH", body: { ...v, hiddenWords } });
        if (r.ok) {
          setState("saved");
          router.refresh();
        } else setState(errorText(lang, r.code));
      }}
    >
      <div className="flex items-center gap-4">
        <label className="relative cursor-pointer">
          {v.avatarUrl ? (
            <img src={v.avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span className="grid h-20 w-20 place-items-center rounded-full bg-tent-200 text-3xl">👤</span>
          )}
          <span className="absolute -bottom-1 -right-1 rounded-full bg-tent-600 px-2 text-xs font-semibold text-white">{t("settings.changePhoto")}</span>
          <input type="file" accept="image/*" className="sr-only" aria-label={t("settings.photo")} onChange={(e) => void uploadPhoto(e.target.files?.[0], "avatarUrl")} />
        </label>
        <label className="tap grid flex-1 cursor-pointer place-items-center rounded-xl bg-white text-sm font-semibold ring-1 ring-tent-200">
          🖼 {t("settings.cover")}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => void uploadPhoto(e.target.files?.[0], "coverUrl")} />
        </label>
      </div>

      <label className="block space-y-1 text-sm font-semibold">
        {t("settings.username")}
        <input value={v.username} onChange={(e) => set("username", e.target.value)} className={field} autoCapitalize="none" />
        <span className="block text-xs font-normal text-stone-500">{t("settings.usernameHint")}</span>
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        {t("settings.displayName")}
        <input value={v.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={50} className={field} />
      </label>
      <label className="block space-y-1 text-sm font-semibold">
        {t("settings.bio")}
        <textarea value={v.bio} onChange={(e) => set("bio", e.target.value)} maxLength={150} rows={3} className="w-full rounded-xl border border-tent-200 p-3" />
        <span className="block text-right text-xs font-normal text-stone-400">{v.bio.length}/150</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm font-semibold">
          {t("settings.link")}
          <input value={v.link} onChange={(e) => set("link", e.target.value)} placeholder="https://" className={field} />
        </label>
        <label className="block space-y-1 text-sm font-semibold">
          {t("settings.subCity")}
          <input value={v.subCity} onChange={(e) => set("subCity", e.target.value)} maxLength={40} className={field} />
        </label>
      </div>

      <section className="space-y-2">
        <h2 className="font-bold">{t("settings.privacy")}</h2>
        {toggle("isPrivate", t("settings.private"), t("settings.privateHint"))}
        {toggle("showEvents", t("settings.showEvents"))}
        {toggle("lowDataMode", t("settings.lowData"), t("settings.lowDataHint"))}
        {toggle("creatorMode", t("settings.creator"))}
        <label className="block space-y-1 rounded-xl bg-white p-3 text-sm font-semibold ring-1 ring-tent-100">
          {t("settings.hiddenWords")}
          <input value={words} onChange={(e) => (setWords(e.target.value), setState("idle"))} className={field} />
          <span className="block text-xs font-normal text-stone-500">{t("settings.hiddenWordsHint")}</span>
        </label>
      </section>

      {state !== "idle" && state !== "saving" && state !== "saved" && <p className="text-sm font-semibold text-red-600">{state}</p>}
      <button disabled={state === "saving"} className="tap w-full rounded-2xl bg-tent-600 py-3 font-bold text-white disabled:opacity-50">
        {state === "saved" ? `✓ ${t("settings.saved")}` : t("settings.save")}
      </button>
    </form>
  );
}

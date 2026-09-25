"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBirr } from "@dinkuan/core";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { TIERS, type TierKey } from "@dinkuan/marketplace/text";
import { api, errorText } from "@/lib/client";

type Pkg = { tier: TierKey; name: string; priceSantim: number; hours: number; includes: string[]; addons: { name: string; priceSantim: number }[] };
type Draft = { on: boolean; name: string; price: string; hours: string; includes: string; addons: string };

const toDraft = (p: Pkg | undefined): Draft =>
  p
    ? {
        on: true,
        name: p.name,
        price: String(p.priceSantim / 100),
        hours: String(p.hours),
        includes: p.includes.join("\n"),
        addons: p.addons.map((a) => `${a.name} | ${formatBirr(a.priceSantim).replace(/,/g, "")}`).join("\n"),
      }
    : { on: false, name: "", price: "", hours: "4", includes: "", addons: "" };

const birrToSantim = (s: string) => Math.round(Number(s.replace(/,/g, "")) * 100);

/** F20-AC4: Basic / Standard / Premium with price, hours, what's included and add-ons. */
export function PackagesForm({ lang, initial }: { lang: Lang; initial: Pkg[] }) {
  const t = translator(lang);
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<TierKey, Draft>>(
    Object.fromEntries(TIERS.map((k) => [k, toDraft(initial.find((p) => p.tier === k))])) as Record<TierKey, Draft>,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: TierKey, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [k]: { ...d[k], ...patch } }));
    setSaved(false);
  };
  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const body = TIERS.filter((k) => drafts[k].on).map((k) => {
          const d = drafts[k];
          return {
            tier: k,
            name: d.name,
            priceSantim: birrToSantim(d.price),
            hours: Number(d.hours),
            includes: d.includes.split("\n").map((x) => x.trim()).filter(Boolean),
            addons: d.addons
              .split("\n")
              .map((line) => line.split("|").map((x) => x.trim()))
              .filter(([n, p]) => n && p)
              .map(([n, p]) => ({ name: n!, priceSantim: birrToSantim(p!) })),
          };
        });
        const r = await api("/api/vendor/packages", { method: "PUT", body });
        if (r.ok) {
          setSaved(true);
          router.refresh();
        } else setError(errorText(lang, r.code));
      }}
    >
      {TIERS.map((k) => {
        const d = drafts[k];
        return (
          <fieldset key={k} className={`space-y-3 rounded-2xl bg-white p-4 ring-1 ${d.on ? "ring-tent-400" : "ring-tent-100"}`}>
            <label className="flex items-center gap-3 font-bold">
              <input type="checkbox" checked={d.on} onChange={(e) => set(k, { on: e.target.checked })} className="h-5 w-5 accent-tent-600" />
              {t(`tier.${k}` as MessageKey)}
            </label>
            {d.on && (
              <>
                <input required minLength={2} maxLength={60} value={d.name} onChange={(e) => set(k, { name: e.target.value })} placeholder={t("packagesForm.name")} aria-label={t("packagesForm.name")} className={field} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1 text-xs font-semibold text-stone-600">
                    {t("packagesForm.price")}
                    <input required inputMode="decimal" value={d.price} onChange={(e) => set(k, { price: e.target.value })} className={field} />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-stone-600">
                    {t("packagesForm.hours")}
                    <input required type="number" min={1} max={72} value={d.hours} onChange={(e) => set(k, { hours: e.target.value })} className={field} />
                  </label>
                </div>
                <label className="block space-y-1 text-xs font-semibold text-stone-600">
                  {t("packagesForm.includes")}
                  <textarea required rows={3} value={d.includes} onChange={(e) => set(k, { includes: e.target.value })} placeholder={t("vendorForm.onePerLine")} className="w-full rounded-xl border border-tent-200 p-3 text-sm" />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-stone-600">
                  {t("packagesForm.addons")}
                  <textarea rows={2} value={d.addons} onChange={(e) => set(k, { addons: e.target.value })} placeholder={t("packagesForm.addonsPlaceholder")} className="w-full rounded-xl border border-tent-200 p-3 text-sm" />
                </label>
              </>
            )}
          </fieldset>
        );
      })}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button className="tap w-full rounded-2xl bg-tent-600 py-3 font-bold text-white">{saved ? `✓ ${t("settings.saved")}` : t("settings.save")}</button>
    </form>
  );
}

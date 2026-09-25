import type { Metadata } from "next";
import Link from "next/link";
import { promotedVendors } from "@dinkuan/ads";
import type { MessageKey } from "@dinkuan/i18n";
import {
  LEVELS,
  searchFacets,
  searchInput,
  searchVendors,
  shortlistedIds,
  SORTS,
  typeCounts,
  VENDOR_TYPE_ICON,
  VENDOR_TYPES,
  type VendorTypeKey,
} from "@dinkuan/marketplace";
import { CompareBar } from "@/components/CompareBar";
import { VendorCard } from "@/components/VendorCard";
import { viewerKey } from "@/lib/ads";
import { toVendorCard } from "@/lib/market";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hire" };

type SP = Promise<Record<string, string | undefined>>;

const birrToSantim = (v: string | undefined) => (v && /^\d{1,7}$/.test(v) ? Number(v) * 100 : undefined);

/** Hire tab (PRD 6): vendor types, then search with filters and sorts (F20-AC9–AC11). */
export default async function HirePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { lang, t } = await getT();
  const user = await currentUser();
  const viewer = user?.id ?? null;
  const type = (VENDOR_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as VendorTypeKey) : undefined;

  if (!type && !sp.q) {
    const counts = await typeCounts();
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold">{t("hire.title")}</h1>
          <p className="text-stone-600">{t("hire.subtitle")}</p>
        </div>
        <form action="/hire" className="relative">
          <input
            name="q"
            placeholder={t("hire.searchPlaceholder")}
            className="tap w-full rounded-2xl border border-tent-200 bg-white px-4 py-3 pr-12 shadow-sm outline-none focus:border-tent-500"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" aria-hidden>
            🔍
          </span>
        </form>
        <div className="grid grid-cols-3 gap-2">
          {VENDOR_TYPES.map((k) => (
            <Link
              key={k}
              href={`/hire?type=${k}`}
              className="flex flex-col items-center gap-1 rounded-2xl bg-white p-3 text-center ring-1 ring-tent-100"
            >
              <span className="text-3xl" aria-hidden>
                {VENDOR_TYPE_ICON[k]}
              </span>
              <span className="text-sm font-bold leading-tight">{t(`vendorType.${k}` as MessageKey)}</span>
              <span className="text-xs text-stone-500">{t("hire.count", { n: counts[k] ?? 0 })}</span>
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm font-semibold">
          <Link href="/hire/shortlist" className="tap grid place-items-center rounded-2xl bg-white ring-1 ring-tent-100">
            ♥ {t("hire.myShortlist")}
          </Link>
          <Link href="/inbox" className="tap grid place-items-center rounded-2xl bg-white ring-1 ring-tent-100">
            💬 {t("inbox.title")}
          </Link>
        </div>
        <Link href="/vendor" className="block rounded-2xl bg-ink p-4 text-tent-100">
          <span className="block font-bold">{t("hire.areYouVendor")}</span>
          <span className="text-sm text-tent-200">{t("hire.areYouVendorHint")} →</span>
        </Link>
      </div>
    );
  }

  const parsed = searchInput.safeParse({
    type,
    q: sp.q || undefined,
    date: sp.date || undefined,
    minPriceSantim: birrToSantim(sp.min),
    maxPriceSantim: birrToSantim(sp.max),
    minRating: sp.rating || undefined,
    genre: sp.genre || undefined,
    area: sp.area || undefined,
    level: sp.level || undefined,
    language: sp.lang || undefined,
    sort: sp.sort || undefined,
    page: sp.page || undefined,
  });
  const input = parsed.success ? parsed.data : searchInput.parse({ type });
  const promoted = await promotedVendors(type, await viewerKey(viewer), viewer);
  const [result, facets, saved] = await Promise.all([
    searchVendors(input, viewer, promoted.map((p) => p.vendorId)).catch(() => searchVendors({ type }, viewer)),
    searchFacets(type),
    shortlistedIds(viewer),
  ]);
  const campaignOf = new Map(promoted.map((p) => [p.vendorId, p.campaignId]));
  const cards = [
    ...result.promoted.map((v) => toVendorCard(v, { saved: saved.has(v.userId), campaignId: campaignOf.get(v.userId) })),
    ...result.items.map((v) => toVendorCard(v, { saved: saved.has(v.userId) })),
  ];
  const select = "tap w-full rounded-xl border border-tent-200 bg-white px-2 text-sm";
  const label = "space-y-1 text-xs font-semibold text-stone-600";
  const pageHref = (page: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => !!e[1]));
    q.set("page", String(page));
    return `/hire?${q}`;
  };

  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center gap-2">
        <Link href="/hire" className="tap grid place-items-center rounded-full text-xl" aria-label={t("hire.title")}>
          ←
        </Link>
        <h1 className="text-xl font-extrabold">
          {type ? `${VENDOR_TYPE_ICON[type]} ${t(`vendorType.${type}` as MessageKey)}` : t("hire.results")}
        </h1>
      </div>
      <form action="/hire" className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
        {type && <input type="hidden" name="type" value={type} />}
        <input
          name="q"
          defaultValue={sp.q}
          placeholder={t("hire.searchPlaceholder")}
          className="tap w-full rounded-xl border border-tent-200 bg-white px-3 outline-none focus:border-tent-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>
            {t("hire.date")}
            <input type="date" name="date" defaultValue={sp.date} className={select} />
          </label>
          <label className={label}>
            {t("hire.sort")}
            <select name="sort" defaultValue={input.sort} className={select}>
              {SORTS.map((s) => (
                <option key={s} value={s}>
                  {t(`hire.sort.${s}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="group" open={!!(sp.min || sp.max || sp.rating || sp.genre || sp.area || sp.level || sp.lang)}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-tent-700">⚙ {t("hire.moreFilters")}</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className={label}>
              {t("hire.minPrice")}
              <input name="min" inputMode="numeric" defaultValue={sp.min} placeholder="0" className={select} />
            </label>
            <label className={label}>
              {t("hire.maxPrice")}
              <input name="max" inputMode="numeric" defaultValue={sp.max} placeholder="50000" className={select} />
            </label>
            <label className={label}>
              {t("hire.rating")}
              <select name="rating" defaultValue={sp.rating ?? ""} className={select}>
                <option value="">{t("filter.any")}</option>
                <option value="4.5">★ 4.5+</option>
                <option value="4">★ 4.0+</option>
              </select>
            </label>
            <label className={label}>
              {t("hire.level")}
              <select name="level" defaultValue={sp.level ?? ""} className={select}>
                <option value="">{t("filter.any")}</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {t(`level.${l}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            {[
              ["genre", "hire.genre", facets.genres],
              ["area", "hire.area", facets.areas],
              ["lang", "hire.language", facets.languages],
            ].map(([name, key, options]) => (
              <label key={name as string} className={label}>
                {t(key as MessageKey)}
                <select name={name as string} defaultValue={sp[name as string] ?? ""} className={select}>
                  <option value="">{t("filter.any")}</option>
                  {(options as string[]).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </details>
        <button className="tap w-full rounded-xl bg-tent-600 font-bold text-white">{t("hire.search")}</button>
      </form>

      <p className="text-sm text-stone-500">{t("hire.resultCount", { n: result.total })}</p>
      {cards.length === 0 ? (
        <p className="py-8 text-center text-stone-500">{t("hire.none")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((v) => (
            <VendorCard key={v.userId} v={v} lang={lang} availableOn={result.availableOn} loggedIn={!!user} />
          ))}
        </div>
      )}
      <div className="flex justify-between">
        {input.page > 0 ? (
          <Link href={pageHref(input.page - 1)} className="font-semibold text-tent-600">
            ← {t("hire.prev")}
          </Link>
        ) : (
          <span />
        )}
        {result.nextPage !== null && (
          <Link href={pageHref(result.nextPage)} className="font-semibold text-tent-600">
            {t("hire.next")} →
          </Link>
        )}
      </div>
      <CompareBar lang={lang} />
    </div>
  );
}

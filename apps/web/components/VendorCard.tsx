import Link from "next/link";
import { adClickHref } from "@dinkuan/ads/text";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { formatStars, VENDOR_TYPE_ICON, type VendorTypeKey } from "@dinkuan/marketplace/text";
import { birr } from "@/lib/format";
import type { VendorCardDTO } from "@/lib/market-types";
import { Avatar } from "./Avatar";
import { CompareToggle } from "./CompareBar";
import { ShortlistButton } from "./ShortlistButton";
import { AdView, SponsoredLabel } from "./Sponsored";

export function LevelBadge({ level, lang }: { level: VendorCardDTO["level"]; lang: Lang }) {
  const t = translator(lang);
  if (level === "new") return null;
  const tone = level === "pro" ? "bg-ink text-tent-100" : level === "top_rated" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{t(`level.${level}` as MessageKey)}</span>;
}

export function Stars({ ratingAvg, ratingCount, lang }: { ratingAvg: number; ratingCount: number; lang: Lang }) {
  const t = translator(lang);
  if (!ratingCount) return <span className="text-xs text-stone-500">{t("hire.noReviews")}</span>;
  return (
    <span className="text-sm font-semibold">
      ★ {formatStars(ratingAvg)} <span className="font-normal text-stone-500">({ratingCount})</span>
    </span>
  );
}

/** F20-AC11: cover, name, level, rating (count), starting price, top genres, "Available on your date". */
export function VendorCard({
  v,
  lang,
  availableOn,
  loggedIn,
}: {
  v: VendorCardDTO;
  lang: Lang;
  availableOn: string | null;
  loggedIn: boolean;
}) {
  const t = translator(lang);
  const href = v.campaignId ? adClickHref(v.campaignId, "search_top") : `/hire/v/${v.username}`;
  const card = (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-tent-100" data-testid="vendor-card">
      <Link href={href} prefetch={v.campaignId ? false : undefined} className="block">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-tent-300 to-tent-700">
          {v.coverUrl && <img src={v.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
          <span className="absolute left-2 top-2 flex gap-1">
            {v.campaignId && <SponsoredLabel />}
            {availableOn && (
              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold text-white">✓ {t("hire.availableOnDate")}</span>
            )}
          </span>
        </div>
        <div className="flex gap-3 p-3">
          <span className="-mt-8 rounded-full ring-4 ring-white">
            <Avatar profile={v} size={48} />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="flex items-center gap-1.5">
              <span className="truncate font-bold">{v.displayName}</span>
              {v.isVerified && <span className="text-sky-600">✓</span>}
              <LevelBadge level={v.level} lang={lang} />
            </p>
            <p className="truncate text-xs text-stone-500">
              {v.types.map((x) => VENDOR_TYPE_ICON[x as VendorTypeKey]).join(" ")} {v.headline}
            </p>
            <p className="flex items-center justify-between gap-2">
              <Stars ratingAvg={v.ratingAvg} ratingCount={v.ratingCount} lang={lang} />
              {v.startingPriceSantim !== null && (
                <span className="text-sm font-bold text-tent-700">{t("hire.from", { price: birr(v.startingPriceSantim) })}</span>
              )}
            </p>
            {v.genres.length > 0 && <p className="truncate text-xs text-stone-500">{v.genres.join(" · ")}</p>}
          </div>
        </div>
      </Link>
      <div className="flex border-t border-tent-100">
        <ShortlistButton lang={lang} vendorId={v.userId} initial={v.saved} loggedIn={loggedIn} />
        <CompareToggle lang={lang} vendor={{ id: v.userId, name: v.displayName }} />
      </div>
    </article>
  );
  return v.campaignId ? (
    <AdView campaignId={v.campaignId} placement="search_top">
      {card}
    </AdView>
  ) : (
    card
  );
}

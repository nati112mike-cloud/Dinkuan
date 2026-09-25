import type { Metadata } from "next";
import Link from "next/link";
import type { MessageKey } from "@dinkuan/i18n";
import { compareVendors, formatStars, MAX_COMPARE } from "@dinkuan/marketplace";
import { Avatar } from "@/components/Avatar";
import { LevelBadge } from "@/components/VendorCard";
import { birr } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compare" };

const UUID = /^[0-9a-f-]{36}$/i;

/** F20-AC12: compare up to three vendors: price, packages, rating, experience, verified gigs, response time. */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = "" } = await searchParams;
  const { lang, t } = await getT();
  const user = await currentUser();
  const list = ids.split(",").filter((x) => UUID.test(x)).slice(0, MAX_COMPARE);
  const rows = await compareVendors(list, user?.id ?? null);
  if (rows.length === 0) {
    return (
      <div className="space-y-3 py-8 text-center">
        <p className="text-stone-600">{t("compare.empty")}</p>
        <Link href="/hire" className="font-semibold text-tent-600">
          {t("hire.title")} →
        </Link>
      </div>
    );
  }
  const line = (label: MessageKey, cell: (r: (typeof rows)[number]) => React.ReactNode) => (
    <tr className="border-t border-tent-100">
      <th scope="row" className="sticky left-0 bg-tent-50 py-2 pr-2 text-left text-xs font-semibold text-stone-500">
        {t(label)}
      </th>
      {rows.map((r) => (
        <td key={r.userId} className="px-2 py-2 align-top text-sm">
          {cell(r)}
        </td>
      ))}
    </tr>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("compare.title")}</h1>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[340px] table-fixed border-collapse" data-testid="compare">
          <thead>
            <tr>
              <th className="w-24" />
              {rows.map((r) => {
                const p = r.user.profile!;
                return (
                  <th key={r.userId} className="px-2 pb-2 text-left align-bottom">
                    <Link href={`/hire/v/${p.username}`} className="block space-y-1">
                      <Avatar profile={{ ...p, displayName: p.displayName || p.username }} size={44} />
                      <span className="block truncate text-sm font-bold">{p.displayName || p.username}</span>
                      <LevelBadge level={r.level} lang={lang} />
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {line("compare.from", (r) => (r.startingPriceSantim === null ? "—" : <b>{birr(r.startingPriceSantim)}</b>))}
            {line("compare.rating", (r) => (r.ratingCount ? `★ ${formatStars(r.ratingAvg)} (${r.ratingCount})` : "—"))}
            {line("vendor.experience", (r) => t("vendor.years", { n: r.yearsExperience }))}
            {line("vendor.verifiedGigs", (r) => r._count.albums)}
            {line("vendor.responseTime", (r) =>
              r.responseTimeMin === null ? "—" : r.responseTimeMin < 60 ? t("vendor.minutes", { n: r.responseTimeMin }) : t("vendor.hours", { n: Math.round(r.responseTimeMin / 60) }),
            )}
            {line("compare.bookings", (r) => r.bookingsCount)}
            {line("vendor.packages", (r) =>
              r.packages.length === 0 ? (
                "—"
              ) : (
                <ul className="space-y-1">
                  {r.packages.map((p) => (
                    <li key={p.id}>
                      <span className="block text-xs text-stone-500">{t(`tier.${p.tier}` as MessageKey)}</span>
                      <span className="font-semibold">{birr(p.priceSantim)}</span> · {t("vendor.hoursShort", { n: p.hours })}
                    </li>
                  ))}
                </ul>
              ),
            )}
            {line("vendor.genres", (r) => r.genres.slice(0, 4).join(", ") || "—")}
            <tr className="border-t border-tent-100">
              <th />
              {rows.map((r) => (
                <td key={r.userId} className="px-2 py-3">
                  <Link href={`/hire/request/${r.user.profile!.username}`} className="tap grid place-items-center rounded-xl bg-tent-600 text-sm font-bold text-white">
                    {t("vendor.request")}
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

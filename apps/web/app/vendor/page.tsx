import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import { formatStars, getVendor, listConversations, pendingGigs } from "@dinkuan/marketplace";
import { VendorForm } from "@/components/VendorForm";
import { LevelBadge } from "@/components/VendorCard";
import { birr } from "@/lib/format";
import { currentMember } from "@/lib/social";
import { getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vendor dashboard" };

/** Vendor dashboard (PRD 6): requests, calendar, packages, portfolio. New vendors set up here. */
export default async function VendorDashboard() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/vendor");
  const { lang, t } = await getT();
  const [vendor, gigs] = await Promise.all([getVendor(me.user.id), pendingGigs(me.user.id)]);
  const gigLink = gigs.length > 0 && (
    <Link href="/vendor/gigs" className="flex items-center justify-between rounded-2xl bg-amber-50 p-4 font-semibold text-amber-900 ring-1 ring-amber-200">
      {t("gigs.pending", { n: gigs.length })} <span aria-hidden>→</span>
    </Link>
  );
  if (!vendor) {
    return (
      <div className="space-y-4">
        {gigLink}
        <h1 className="text-2xl font-extrabold">{t("vendor.setupTitle")}</h1>
        <p className="text-stone-600">{t("vendor.setupHint")}</p>
        <VendorForm lang={lang} initial={null} />
      </div>
    );
  }
  const convos = (await listConversations(me.user.id)).filter((c) => c.asVendor);
  const open = convos.filter((c) => c.request.status === "requested").length;
  const unread = convos.filter((c) => c.unread).length;
  const responseRate = vendor.requestsCount ? Math.round((vendor.repliedCount * 100) / vendor.requestsCount) : 100;
  const stat = (label: MessageKey, value: React.ReactNode) => (
    <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-tent-100">
      <p className="text-xl font-extrabold">{value}</p>
      <p className="text-xs text-stone-500">{t(label)}</p>
    </div>
  );
  const links: [string, string, MessageKey][] = [
    ["/inbox", "💬", "vendor.dash.requests"],
    ["/vendor/profile", "✏️", "vendor.dash.profile"],
    ["/vendor/packages", "📦", "vendor.dash.packages"],
    ["/vendor/calendar", "📅", "vendor.dash.calendar"],
    ["/vendor/portfolio", "🖼", "vendor.dash.portfolio"],
    [`/promote?type=profile&id=${vendor.userId}`, "📣", "vendor.dash.promote"],
  ];
  return (
    <div className="space-y-5">
      {gigLink}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{t("vendor.dash.title")}</h1>
        <LevelBadge level={vendor.level} lang={lang} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stat("vendor.dash.open", open)}
        {stat("vendor.dash.unread", unread)}
        {stat("vendor.dash.responseRate", `${responseRate}%`)}
        {stat("vendor.responseTime", vendor.responseTimeMin === null ? "—" : t("vendor.minutes", { n: vendor.responseTimeMin }))}
        {stat("compare.rating", vendor.ratingCount ? `★ ${formatStars(vendor.ratingAvg)}` : "—")}
        {stat("compare.from", vendor.startingPriceSantim === null ? "—" : birr(vendor.startingPriceSantim))}
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {links.map(([href, icon, key]) => (
          <li key={href}>
            <Link href={href} className="flex h-full items-center gap-2 rounded-2xl bg-white p-4 font-semibold ring-1 ring-tent-100">
              <span className="text-xl" aria-hidden>
                {icon}
              </span>
              {t(key)}
            </Link>
          </li>
        ))}
      </ul>
      <Link href={`/hire/v/${me.profile.username}`} className="block text-center font-semibold text-tent-600">
        {t("vendor.dash.viewPublic")} →
      </Link>
      <p className="rounded-xl bg-tent-100 p-3 text-xs text-tent-800">{t("vendor.dash.levelsHint")}</p>
    </div>
  );
}

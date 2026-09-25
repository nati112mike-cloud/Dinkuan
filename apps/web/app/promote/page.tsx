import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { estimatedReach, listPromoPackages, myCampaigns, PROMO_TARGETS, type PromoTargetKey } from "@dinkuan/ads";
import { prisma } from "@dinkuan/db";
import type { Lang, MessageKey } from "@dinkuan/i18n";
import { PromoteBuy } from "@/components/PromoteBuy";
import { birr, eventTitle } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promote" };

async function targetLabel(type: PromoTargetKey, id: string, lang: Lang): Promise<string | null> {
  switch (type) {
    case "event": {
      const e = await prisma.event.findUnique({ where: { id } });
      return e ? eventTitle(e, lang) : null;
    }
    case "post": {
      const p = await prisma.post.findUnique({ where: { id } });
      return p ? p.caption.slice(0, 80) || "📷" : null;
    }
    case "profile": {
      const p = await prisma.profile.findUnique({ where: { userId: id } });
      return p ? p.displayName || p.username : null;
    }
    case "package": {
      const p = await prisma.package.findUnique({ where: { id } });
      return p?.name ?? null;
    }
  }
}

/**
 * F21-AC2/AC3: pick a ready-made package for something you own, with an honest reach estimate.
 * Without a target, lists your promotions and the things you can promote.
 */
export default async function PromotePage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const user = await currentUser();
  const sp = await searchParams;
  const qs = new URLSearchParams(sp as Record<string, string>).toString();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/promote${qs ? `?${qs}` : ""}`)}`);
  const { lang, t } = await getT();
  const type = PROMO_TARGETS.find((x) => x === sp.type);

  if (type && sp.id) {
    const [label, packages] = await Promise.all([targetLabel(type, sp.id, lang), listPromoPackages(type)]);
    if (!label) redirect("/promote");
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">{t("promote.title")}</h1>
        <p className="rounded-2xl bg-white p-3 text-sm ring-1 ring-tent-100">
          {t(`promote.target.${type}` as MessageKey)}: <b>{label}</b>
        </p>
        {packages.length === 0 && <p className="text-stone-500">{t("promote.noPackages")}</p>}
        <ul className="space-y-3">
          {packages.map((p) => {
            const reach = estimatedReach(p);
            return (
              <li key={p.key} className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-tent-100" data-testid={`promo-${p.key}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold">{lang === "am" ? p.nameAm : p.nameEn}</h2>
                  <span className="font-extrabold">{birr(p.priceSantim)} {t("common.birr")}</span>
                </div>
                <p className="text-sm text-stone-600">
                  {t("promote.days", { n: p.days })}
                  {p.impressions ? ` · ${t("promote.impressions", { n: p.impressions.toLocaleString() })}` : ""}
                </p>
                <p className="text-sm text-stone-600">
                  {p.placements.map((pl) => t(`promote.placement.${pl}` as MessageKey)).join(" · ")}
                </p>
                <p className="text-sm font-semibold text-tent-700">
                  {t("promote.reach", { low: reach.low.toLocaleString(), high: reach.high.toLocaleString() })}
                </p>
                <PromoteBuy lang={lang} packageKey={p.key} targetType={type} targetId={sp.id!} />
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-stone-500">{t("promote.fineprint")}</p>
        <p className="text-xs text-stone-500">{t("promote.pushSoon")}</p>
      </div>
    );
  }

  const [campaigns, events, posts, vendor] = await Promise.all([
    myCampaigns(user.id),
    prisma.event.findMany({
      where: {
        status: "published",
        startsAt: { gt: new Date() },
        organiser: { OR: [{ ownerUserId: user.id }, { members: { some: { userId: user.id, role: "manager" } } }] },
      },
      orderBy: { startsAt: "asc" },
      take: 10,
    }),
    prisma.post.findMany({
      where: { authorId: user.id, status: "public", audience: "public" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.vendorProfile.findUnique({ where: { userId: user.id } }),
  ]);
  const row = "tap flex items-center justify-between gap-2 rounded-2xl bg-white px-4 ring-1 ring-tent-100";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("promote.title")}</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("promote.mine")}</h2>
        {campaigns.length === 0 && <p className="text-stone-500">{t("promote.noneYet")}</p>}
        <ul className="space-y-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/promote/c/${c.id}`} className={row}>
                <span className="min-w-0 truncate font-semibold">{lang === "am" ? c.package.nameAm : c.package.nameEn}</span>
                <span className="shrink-0 text-sm text-stone-500">{t(`campaign.status.${c.status}` as MessageKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("promote.pick")}</h2>
        <ul className="space-y-2">
          {vendor && (
            <li>
              <Link href={`/promote?type=profile&id=${user.id}`} className={row}>
                <span className="font-semibold">🎧 {t("promote.target.profile")}</span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          )}
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/promote?type=event&id=${e.id}`} className={row}>
                <span className="min-w-0 truncate font-semibold">🎟 {eventTitle(e, lang)}</span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={`/promote?type=post&id=${p.id}`} className={row}>
                <span className="min-w-0 truncate font-semibold">📣 {p.caption.slice(0, 60) || t("promote.target.post")}</span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
        {!vendor && events.length === 0 && posts.length === 0 && <p className="text-stone-500">{t("promote.nothing")}</p>}
      </section>
    </div>
  );
}

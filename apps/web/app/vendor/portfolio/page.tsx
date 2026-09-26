import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@dinkuan/db";
import type { MessageKey } from "@dinkuan/i18n";
import { getVendor } from "@dinkuan/marketplace";
import { AlbumForm } from "@/components/AlbumForm";
import { CreditsEditor } from "@/components/CreditsEditor";
import { DeleteAlbum } from "@/components/DeleteAlbum";
import { eventTitle } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio" };

/** F20-AC2/AC3: portfolio albums (tag an event to get a verified gig) and stage credits. */
export default async function VendorPortfolioPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/vendor/portfolio");
  if (!(await getVendor(user.id))) redirect("/vendor");
  const { lang, t } = await getT();
  const [albums, credits, events] = await Promise.all([
    prisma.portfolioAlbum.findMany({ where: { vendorId: user.id }, orderBy: { createdAt: "desc" }, include: { items: { take: 1, orderBy: { orderIdx: "asc" } }, event: true, _count: { select: { items: true } } } }),
    prisma.stageCredit.findMany({ where: { vendorId: user.id }, orderBy: [{ verified: "desc" }, { date: "desc" }] }),
    prisma.event.findMany({ where: { status: { in: ["published", "ended"] } }, orderBy: { startsAt: "desc" }, take: 60, select: { id: true, titleEn: true, titleAm: true, startsAt: true } }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("vendor.dash.portfolio")}</h1>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("portfolio.new")}</h2>
        <AlbumForm lang={lang} events={events.map((e) => ({ id: e.id, title: `${eventTitle(e, lang)} · ${e.startsAt.toISOString().slice(0, 10)}` }))} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("vendor.portfolio")}</h2>
        {albums.length === 0 && <p className="text-stone-500">{t("vendor.noPortfolio")}</p>}
        <ul className="space-y-2">
          {albums.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-tent-100">
              {a.coverUrl ? <img src={a.coverUrl} alt="" className="h-16 w-16 rounded-xl object-cover" /> : <span className="h-16 w-16 rounded-xl bg-tent-100" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{a.title}</span>
                <span className="block text-xs text-stone-500">
                  {t("portfolio.items", { n: a._count.items })}
                  {a.event && ` · 🎟 ${eventTitle(a.event, lang)}`}
                </span>
                {a.gigStatus !== "none" && <span className="text-xs font-semibold text-tent-700">{t(`gig.${a.gigStatus}` as MessageKey)}</span>}
              </span>
              <DeleteAlbum lang={lang} albumId={a.id} />
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("vendor.stages")}</h2>
        <CreditsEditor lang={lang} initial={credits.map((c) => ({ id: c.id, name: c.name, verified: c.verified }))} />
      </section>
    </div>
  );
}

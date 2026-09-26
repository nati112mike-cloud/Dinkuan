import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canSellPaid, organiserMoney } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import type { MessageKey } from "@dinkuan/i18n";
import { OrganiserForm } from "@/components/OrganiserForm";
import { birr, eventTitle, formatDay } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";
import { pickOrganiser } from "./org";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Organiser" };

const STATUS_TONE: Record<string, string> = {
  draft: "bg-stone-100 text-stone-700",
  pending_review: "bg-amber-100 text-amber-900",
  published: "bg-emerald-100 text-emerald-800",
  ended: "bg-stone-100 text-stone-500",
  cancelled: "bg-rose-100 text-rose-800",
};

/** F2 application and F11 organiser home: status, money, events. */
export default async function OrganiserPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/organiser");
  const { lang, t } = await getT();
  const sp = await searchParams;
  const { orgs, org } = await pickOrganiser(user.id, sp.org);

  const formInitial = org
    ? {
        type: org.type,
        name: org.name,
        tin: org.tin ?? "",
        licenceUrl: org.licenceUrl,
        payoutMethod: (org.payoutMethod === "bank" ? "bank" : "telebirr") as "bank" | "telebirr",
        payoutAccount: org.payoutAccount ?? "",
      }
    : null;

  if (!org || org.status === "draft" || org.status === "rejected") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">{t("organiser.applyTitle")}</h1>
        <p className="text-stone-600">{t("organiser.applyIntro")}</p>
        {org?.status === "rejected" && (
          <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800" data-testid="reject-reason">
            {t("organiser.rejected", { reason: org.rejectReason ?? "" })}
          </p>
        )}
        <OrganiserForm lang={lang} initial={formInitial} />
      </div>
    );
  }

  if (org.status === "submitted") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold">{org.name}</h1>
        <p className="rounded-xl bg-amber-50 p-4 text-amber-900" data-testid="org-status">
          {t("organiser.submitted")}
        </p>
      </div>
    );
  }

  const [money, events] = await Promise.all([
    organiserMoney(user.id, org.id),
    prisma.event.findMany({ where: { organiserId: org.id }, orderBy: { startsAt: "desc" }, include: { _count: { select: { tickets: true } } } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{org.name}</h1>
          <p className="text-sm text-stone-500">
            {t(org.type === "business" ? "organiser.business" : "organiser.individual")} · {t("organiser.approved")}
          </p>
        </div>
      </div>
      {orgs.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm">
          {orgs.map((o) => (
            <Link key={o.id} href={`/organiser?org=${o.id}`} className={`rounded-full px-3 py-1 ring-1 ${o.id === org.id ? "bg-tent-600 text-white ring-tent-600" : "ring-tent-200"}`}>
              {o.name}
            </Link>
          ))}
        </nav>
      )}
      {!canSellPaid(org) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("tickets.freeOnly")}</p>}
      <section className="grid grid-cols-2 gap-2" data-testid="org-money">
        <Stat label={t("dash.sales")} value={`${birr(money.salesSantim)} ${t("common.birr")}`} />
        <Stat label={t("dash.refunds")} value={`${birr(money.refundsSantim)} ${t("common.birr")}`} />
        <Stat label={t("dash.net")} value={`${birr(money.netSantim)} ${t("common.birr")}`} />
        <Stat label={t("dash.payouts")} value={org.payoutHold ? t("dash.payoutHold") : `${birr(money.payoutsSantim)} ${t("common.birr")}`} />
      </section>
      <div className="flex gap-2">
        <Link href={`/organiser/events/new?org=${org.id}`} className="tap flex flex-1 items-center justify-center rounded-xl bg-tent-700 font-bold text-white">
          + {t("organiser.newEvent")}
        </Link>
        <Link href={`/organiser/team?org=${org.id}`} className="tap flex items-center justify-center rounded-xl bg-white px-4 font-bold ring-1 ring-tent-200">
          {t("organiser.team")}
        </Link>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-bold">{t("organiser.events")}</h2>
        {events.length === 0 && <p className="text-stone-500">{t("organiser.noEvents")}</p>}
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/organiser/events/${e.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{eventTitle(e, lang)}</span>
                  <span className="block text-xs text-stone-500">
                    {formatDay(e.startsAt, lang)} · {t("dash.ticketsN", { n: e._count.tickets })}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_TONE[e.status]}`}>{t(`eventStatus.${e.status}` as MessageKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-tent-100">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="truncate text-lg font-extrabold">{value}</div>
    </div>
  );
}

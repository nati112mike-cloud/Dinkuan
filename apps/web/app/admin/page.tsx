import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminQueues, fraudFlags } from "@dinkuan/core/server";
import type { MessageKey } from "@dinkuan/i18n";
import { ActionButton } from "@/components/ActionButton";
import { birr, eventTitle, formatDay } from "@/lib/format";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin" };

/** F12-AC1/AC3: organisers and events waiting for review, stuck refunds and fraud flags. */
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdmin(user)) notFound();
  const { lang, t } = await getT();
  const [{ organisers, events, refunds }, flags] = await Promise.all([adminQueues(), fraudFlags()]);
  const card = "space-y-2 rounded-2xl bg-white p-3 ring-1 ring-tent-100";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("admin.title")}</h1>
      <nav className="flex flex-wrap gap-2 text-sm font-semibold">
        <Link href="/admin/events" className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
          {t("admin.events")}
        </Link>
        <Link href="/admin/ads" className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
          {t("adReview.title")}
        </Link>
        <Link href="/admin/audit" className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
          {t("admin.audit")}
        </Link>
      </nav>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">
          {t("admin.organisers")} ({organisers.length})
        </h2>
        {organisers.length === 0 && <p className="text-sm text-stone-500">{t("admin.nothing")}</p>}
        <ul className="space-y-2">
          {organisers.map((o) => (
            <li key={o.id} className={card} data-testid="org-review">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold">{o.name}</span>
                <span className="text-xs text-stone-500">{t(o.type === "business" ? "organiser.business" : "organiser.individual")}</span>
              </div>
              <p className="text-sm text-stone-600">
                {o.owner.name ?? `@${o.owner.profile?.username ?? "?"}`} · {o.owner.phone}
              </p>
              <p className="text-sm">
                {o.tin && `TIN ${o.tin} · `}
                {t(o.payoutMethod === "bank" ? "organiser.bank" : "organiser.telebirr")}: {o.payoutAccount}
              </p>
              {o.licenceUrl && (
                <a href={o.licenceUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-tent-700">
                  {t("admin.viewLicence")}
                </a>
              )}
              <div className="flex gap-2">
                <ActionButton lang={lang} url={`/api/admin/organisers/${o.id}`} body={{ approve: true }} label="admin.approve" />
                <ActionButton lang={lang} url={`/api/admin/organisers/${o.id}`} body={{ approve: false }} label="admin.reject" prompt={{ field: "reason", label: "admin.reasonPrompt" }} tone="danger" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">
          {t("admin.eventQueue")} ({events.length})
        </h2>
        {events.length === 0 && <p className="text-sm text-stone-500">{t("admin.nothing")}</p>}
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className={card} data-testid="event-review">
              <div className="flex gap-3">
                <img src={`${e.posterUrl}?size=card`} alt="" className="h-20 w-16 shrink-0 rounded-lg object-cover" />
                <div className="min-w-0 text-sm">
                  <p className="font-bold">{eventTitle(e, lang)}</p>
                  <p className="text-stone-500">
                    {e.organiser.name} · {formatDay(e.startsAt, lang)} · {e.venue.name}
                  </p>
                  <p>{e.ticketTypes.map((tt) => `${tt.name} ${tt.priceSantim ? birr(tt.priceSantim) : t("event.free")}`).join(" · ")}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <ActionButton lang={lang} url={`/api/admin/events/${e.id}/review`} body={{ approve: true }} label="admin.publish" />
                <ActionButton lang={lang} url={`/api/admin/events/${e.id}/review`} body={{ approve: false }} label="admin.sendBack" prompt={{ field: "note", label: "admin.notePrompt" }} tone="danger" />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">
          {t("admin.refunds")} ({refunds.length})
        </h2>
        {refunds.length === 0 && <p className="text-sm text-stone-500">{t("admin.nothing")}</p>}
        <ul className="space-y-2">
          {refunds.map((o) => (
            <li key={o.id} className={card}>
              <p className="text-sm">
                <span className="font-bold">{eventTitle(o.event, lang)}</span> · {birr(o.totalSantim)} {t("common.birr")}
              </p>
              {o.refunds[0] && <p className="text-xs text-stone-500">{o.refunds[0].reason}</p>}
              <ActionButton lang={lang} url={`/api/admin/orders/${o.id}/refund`} label="admin.retryRefund" />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">
          {t("admin.fraud")} ({flags.length})
        </h2>
        {flags.length === 0 && <p className="text-sm text-stone-500">{t("admin.noFlags")}</p>}
        <ul className="space-y-2">
          {flags.map((f, i) => (
            <li key={i} className="rounded-xl bg-rose-50 p-2 text-sm text-rose-900" data-testid="fraud-flag">
              <span className="font-bold">{t(`fraud.${f.kind}` as MessageKey)}</span>
              {" · "}
              {f.kind === "duplicate_scans" ? `/e/${f.eventSlug}` : f.phone}
              {f.kind === "tickets_per_phone" && ` · /e/${f.eventSlug}`} · {f.count}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

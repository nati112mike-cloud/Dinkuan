import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { attendees, eventStats, missingForPublish, organiserAccess } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import type { MessageKey } from "@dinkuan/i18n";
import { ActionButton } from "@/components/ActionButton";
import { WizardSteps } from "@/components/WizardSteps";
import { birr, eventTitle, formatDay, formatTime } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event dashboard" };

/** F3 review step and F11 event dashboard: what's missing, publish, stats, attendees, cancel. */
export default async function OrganiserEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/organiser/events/${id}`);
  const found = await prisma.event.findUnique({ where: { id }, select: { organiserId: true } });
  if (!found) notFound();
  const access = await organiserAccess(user.id, found.organiserId);
  if (!access || access === "scanner") notFound();
  const { lang, t } = await getT();
  const [stats, people] = await Promise.all([eventStats(user.id, id), attendees(user.id, id)]);
  const { event } = stats;
  const missing = missingForPublish(event);
  const editable = event.status !== "ended" && event.status !== "cancelled";
  const br = (s: number) => `${birr(s)} ${t("common.birr")}`;

  return (
    <div className="space-y-6">
      {event.status === "draft" && <WizardSteps lang={lang} step={3} />}
      <div className="flex gap-3">
        <img src={`${event.posterUrl}?size=card`} alt="" className="h-24 w-20 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-extrabold">{eventTitle(event, lang)}</h1>
          <p className="text-sm text-stone-500">
            {formatDay(event.startsAt, lang)} · {formatTime(event.startsAt, lang)} · {event.venue.name}
          </p>
          <p className="text-sm font-bold" data-testid="event-status">
            {t(`eventStatus.${event.status}` as MessageKey)}
          </p>
        </div>
      </div>

      {event.reviewNote && event.status === "draft" && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{t("organiser.reviewNote", { note: event.reviewNote })}</p>}
      {event.status === "pending_review" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("organiser.inReview")}</p>}

      {editable && (
        <nav className="flex flex-wrap gap-2 text-sm font-semibold">
          <Link href={`/organiser/events/${id}/edit`} className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
            ✎ {t("organiser.editDetails")}
          </Link>
          <Link href={`/organiser/events/${id}/tickets`} className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
            🎟 {t("tickets.types")}
          </Link>
          {event.status === "published" && (
            <Link href={`/e/${event.slug}`} className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
              ↗ {t("organiser.viewPublic")}
            </Link>
          )}
        </nav>
      )}

      {event.status === "draft" && (
        <section className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
          <h2 className="font-bold">{t("wizard.review")}</h2>
          <ul className="space-y-1 text-sm">
            {event.ticketTypes.map((tt) => (
              <li key={tt.id} className="flex justify-between">
                <span>
                  {tt.name} {tt.visibility === "hidden" && "🔒"}
                </span>
                <span>
                  {tt.priceSantim === 0 ? t("event.free") : br(tt.priceSantim)} · {tt.capacity}
                </span>
              </li>
            ))}
          </ul>
          {missing.length > 0 ? (
            <ul className="list-inside list-disc text-sm text-rose-700" data-testid="missing">
              {missing.map((m) => (
                <li key={m}>{t(`missing.${m}` as MessageKey)}</li>
              ))}
            </ul>
          ) : (
            <ActionButton lang={lang} url={`/api/organiser/events/${id}/submit`} label="organiser.publish" />
          )}
        </section>
      )}

      {(event.status === "published" || event.status === "ended" || event.status === "cancelled") && (
        <>
          <section className="grid grid-cols-2 gap-2" data-testid="event-stats">
            <Stat label={t("dash.gross")} value={br(stats.grossSantim)} />
            <Stat label={t("dash.net")} value={br(stats.netSantim)} />
            <Stat label={t("dash.tickets")} value={String(stats.ticketsIssued)} />
            <Stat label={t("dash.checkIns")} value={`${stats.checkIns} / ${stats.ticketsIssued}`} />
            <Stat label={t("dash.refunds")} value={br(stats.refundsSantim)} />
            <Stat label={t("dash.fees")} value={br(stats.feesSantim)} />
          </section>
          <p className="text-xs text-stone-500">{t("dash.feeNote")}</p>
          <section className="space-y-2">
            <h2 className="font-bold">{t("dash.byType")}</h2>
            <ul className="space-y-2">
              {stats.types.map((ty) => (
                <li key={ty.id} className="space-y-1 rounded-xl bg-white p-2 text-sm ring-1 ring-tent-100">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{ty.name}</span>
                    <span>
                      {ty.sold} / {ty.capacity} · {br(ty.revenueSantim)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-tent-100">
                    <div className="h-full bg-tent-600" style={{ width: `${Math.min(100, Math.round((ty.sold / ty.capacity) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">
                {t("dash.attendees")} ({people.length})
              </h2>
              <a href={`/api/organiser/events/${id}/attendees`} className="text-sm font-semibold text-tent-700" download>
                ⬇ CSV
              </a>
            </div>
            <p className="text-xs text-stone-500">{t("dash.phoneNote")}</p>
            <ul className="divide-y divide-tent-100 rounded-2xl bg-white ring-1 ring-tent-100" data-testid="attendees">
              {people.slice(0, 100).map((p) => (
                <li key={p.ticketId} className="flex items-center gap-2 p-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block text-xs text-stone-500">
                      {p.ticketType}
                      {p.phone && ` · ${p.phone}`}
                    </span>
                  </span>
                  <span className={`text-xs font-bold ${p.checkedIn ? "text-emerald-700" : "text-stone-400"}`}>{p.checkedIn ? `✓ ${t("dash.in")}` : "—"}</span>
                </li>
              ))}
              {people.length === 0 && <li className="p-3 text-sm text-stone-500">{t("dash.noAttendees")}</li>}
            </ul>
            {people.length > 100 && <p className="text-xs text-stone-500">{t("dash.moreInCsv", { n: people.length - 100 })}</p>}
          </section>
        </>
      )}

      {editable && event.status !== "draft" && (
        <section className="space-y-2 border-t border-tent-100 pt-4">
          <p className="text-xs text-stone-500">{t("organiser.cancelHint")}</p>
          <ActionButton
            lang={lang}
            url={`/api/organiser/events/${id}/cancel`}
            label="organiser.cancelEvent"
            confirm="organiser.cancelConfirm"
            prompt={{ field: "reason", label: "organiser.cancelReason" }}
            tone="danger"
          />
        </section>
      )}
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

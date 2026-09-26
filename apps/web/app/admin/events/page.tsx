import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@dinkuan/db";
import { ActionButton } from "@/components/ActionButton";
import { FeeForm } from "@/components/FeeForm";
import { eventTitle, formatDay } from "@/lib/format";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events admin" };

/** F12-AC2: feature events on the home page and override the fee per event. */
export default async function AdminEventsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/events");
  if (!isAdmin(user)) notFound();
  const { lang, t } = await getT();
  const events = await prisma.event.findMany({
    where: { status: "published", startsAt: { gt: new Date(Date.now() - 86_400_000) } },
    orderBy: { startsAt: "asc" },
    take: 100,
    include: { organiser: { select: { name: true } } },
  });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("admin.events")}</h1>
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="admin-event">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/e/${e.slug}`} className="min-w-0">
                <span className="block truncate font-bold">
                  {e.featured && "★ "}
                  {eventTitle(e, lang)}
                </span>
                <span className="block text-xs text-stone-500">
                  {e.organiser.name} · {formatDay(e.startsAt, lang)}
                </span>
              </Link>
              <ActionButton
                lang={lang}
                url={`/api/admin/events/${e.id}/feature`}
                body={{ featured: !e.featured }}
                label={e.featured ? "adminEvents.unfeature" : "adminEvents.feature"}
                tone={e.featured ? "quiet" : "primary"}
              />
            </div>
            <FeeForm lang={lang} eventId={e.id} pctBps={e.feePctBps} fixedSantim={e.feeFixedSantim} />
          </li>
        ))}
      </ul>
    </div>
  );
}

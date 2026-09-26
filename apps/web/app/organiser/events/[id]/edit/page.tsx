import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EVENT_CATEGORIES, organiserAccess } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { EventForm } from "@/components/EventForm";
import { toAddisInput } from "@/lib/addis-time";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/organiser/events/${id}/edit`);
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) notFound();
  const access = await organiserAccess(user.id, event.organiserId);
  if (!access || access === "scanner") notFound();
  if (event.status === "ended" || event.status === "cancelled") redirect(`/organiser/events/${id}`);
  const { lang, t } = await getT();
  const venues = await prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true }, take: 100 });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("organiser.editEvent")}</h1>
      <EventForm
        lang={lang}
        organiserId={event.organiserId}
        eventId={event.id}
        venues={venues}
        categories={EVENT_CATEGORIES}
        initial={{
          titleAm: event.titleAm ?? "",
          titleEn: event.titleEn ?? "",
          descAm: event.descAm ?? "",
          descEn: event.descEn ?? "",
          category: event.category,
          venueId: event.venueId,
          startsAt: toAddisInput(event.startsAt),
          endsAt: toAddisInput(event.endsAt),
          posterUrl: event.posterUrl.startsWith("/posters/") ? null : event.posterUrl,
          lineup: event.lineup.join(", "),
        }}
      />
    </div>
  );
}

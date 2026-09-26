import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { canSellPaid, organiserAccess } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { TicketTypesForm } from "@/components/TicketTypesForm";
import { WizardSteps } from "@/components/WizardSteps";
import { toAddisInput } from "@/lib/addis-time";
import { eventTitle } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tickets" };

/** F3 wizard, step 2: ticket types. */
export default async function EventTicketsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/organiser/events/${id}/tickets`);
  const event = await prisma.event.findUnique({ where: { id }, include: { organiser: true, ticketTypes: { orderBy: { sortOrder: "asc" } } } });
  if (!event) notFound();
  const access = await organiserAccess(user.id, event.organiserId);
  if (!access || access === "scanner") notFound();
  if (event.status === "ended" || event.status === "cancelled") redirect(`/organiser/events/${id}`);
  const { lang, t } = await getT();
  return (
    <div className="space-y-4">
      {event.status === "draft" && <WizardSteps lang={lang} step={2} />}
      <h1 className="text-2xl font-extrabold">{t("tickets.types")}</h1>
      <p className="text-sm text-stone-500">{eventTitle(event, lang)}</p>
      <TicketTypesForm
        lang={lang}
        eventId={event.id}
        canSellPaid={canSellPaid(event.organiser)}
        initial={event.ticketTypes.map((tt) => ({
          id: tt.id,
          name: tt.name,
          priceBirr: String(tt.priceSantim / 100),
          capacity: String(tt.capacity),
          salesStart: toAddisInput(tt.salesStart),
          salesEnd: toAddisInput(tt.salesEnd),
          perOrderMax: String(tt.perOrderMax),
          hidden: tt.visibility === "hidden",
          accessCode: tt.accessCode ?? "",
          sold: tt.sold,
        }))}
      />
    </div>
  );
}

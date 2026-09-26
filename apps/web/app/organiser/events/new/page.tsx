import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSellPaid, EVENT_CATEGORIES } from "@dinkuan/core/server";
import { prisma } from "@dinkuan/db";
import { EventForm } from "@/components/EventForm";
import { WizardSteps } from "@/components/WizardSteps";
import { currentUser, getT } from "@/lib/session";
import { pickOrganiser } from "../../org";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New event" };

/** F3 wizard, step 1: details. */
export default async function NewEventPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/organiser/events/new");
  const { org } = await pickOrganiser(user.id, (await searchParams).org);
  if (!org || org.status !== "approved") redirect("/organiser");
  const { lang, t } = await getT();
  const venues = await prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true }, take: 100 });
  return (
    <div className="space-y-4">
      <WizardSteps lang={lang} step={1} />
      <h1 className="text-2xl font-extrabold">{t("organiser.newEvent")}</h1>
      {!canSellPaid(org) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("tickets.freeOnly")}</p>}
      <EventForm lang={lang} organiserId={org.id} venues={venues} categories={EVENT_CATEGORIES} />
    </div>
  );
}

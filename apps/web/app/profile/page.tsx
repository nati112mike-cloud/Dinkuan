import Link from "next/link";
import { redirect } from "next/navigation";
import { maskPhone } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";
import { EventCard } from "@/components/EventCard";
import { LogoutButton } from "@/components/LogoutButton";
import { NameForm } from "@/components/NameForm";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/profile");
  const { lang, t } = await getT();
  const saved = await prisma.savedEvent.findMany({
    where: { userId: user.id },
    include: { event: { include: { venue: true, organiser: true, ticketTypes: { orderBy: { sortOrder: "asc" } } } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">{t("profile.title")}</h1>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-tent-100">
        <NameForm lang={lang} initial={user.name ?? ""} />
        <p className="text-sm text-stone-500">{maskPhone(user.phone)}</p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("profile.saved")}</h2>
        {saved.length === 0 ? (
          <p className="text-stone-500">
            {t("home.empty")}{" "}
            <Link href="/events" className="font-semibold text-tent-600">
              {t("tickets.findEvents")}
            </Link>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {saved.map((s) => (
              <EventCard key={s.eventId} event={s.event} lang={lang} />
            ))}
          </div>
        )}
      </section>
      <LogoutButton lang={lang} />
    </div>
  );
}

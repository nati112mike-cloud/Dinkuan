import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@dinkuan/db";
import { Composer } from "@/components/Composer";
import { eventTitle } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(event ? `/create?event=${event}` : "/create")}`);
  const { lang } = await getT();
  // Events to tag: anything from the last two weeks and upcoming (F15-AC2).
  const events = await prisma.event.findMany({
    where: { status: { in: ["published", "ended"] }, startsAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: { id: true, titleAm: true, titleEn: true },
  });
  const options = events.map((e) => ({ id: e.id, title: eventTitle(e, lang) }));
  const initial = event && options.some((o) => o.id === event) ? event : null;
  return <Composer lang={lang} events={options} initialEventId={initial} />;
}

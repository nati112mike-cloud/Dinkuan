import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { allInPrice, feePerTicket } from "@dinkuan/core";
import { prisma } from "@dinkuan/db";
import { SaveButton } from "@/components/SaveButton";
import { ShareButton } from "@/components/ShareButton";
import { TicketSelector } from "@/components/TicketSelector";
import { getEventBySlug } from "@/lib/events";
import { ethiopianDate, eventDesc, eventTitle, formatLongDate, formatTime } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event) return {};
  const title = event.titleEn ?? event.titleAm ?? "";
  const description = `${formatLongDate(event.startsAt, "en")} · ${event.venue.name}`;
  // F4-AC6: Open Graph preview with poster + title for Telegram, WhatsApp and Instagram DMs.
  const image = { url: `${event.posterUrl}?size=share`, width: 1080, height: 1080, alt: title };
  return {
    title,
    description,
    openGraph: { title, description, images: [image], type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function EventPage({ params }: { params: Params }) {
  const { slug } = await params;
  const event = await getEventBySlug(slug);
  if (!event || event.status === "draft" || event.status === "pending_review") notFound();
  const { lang, t } = await getT();
  const user = await currentUser();
  const saved = user
    ? !!(await prisma.savedEvent.findUnique({ where: { userId_eventId: { userId: user.id, eventId: event.id } } }))
    : false;
  const cfg = { feePctBps: event.feePctBps, feeFixedSantim: event.feeFixedSantim };
  const now = new Date();
  const ended = event.status === "ended" || (event.endsAt ?? event.startsAt) < now;
  const types = event.ticketTypes
    .filter((tt) => tt.visibility === "public")
    .map((tt) => {
      const left = tt.capacity - tt.sold - tt.reserved;
      const closed = (tt.salesStart && tt.salesStart > now) || (tt.salesEnd && tt.salesEnd < now);
      return {
        id: tt.id,
        name: tt.name,
        price: tt.priceSantim,
        allIn: allInPrice(tt.priceSantim, cfg),
        fee: feePerTicket(tt.priceSantim, cfg),
        left: Math.max(0, left),
        max: Math.min(tt.perOrderMax, Math.max(0, left)),
        soldOut: left <= 0,
        closed: !!closed,
      };
    });
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${event.venue.lat},${event.venue.lng}`;
  const title = eventTitle(event, lang);

  return (
    <article className="space-y-5">
      <div className="-mx-4 overflow-hidden bg-tent-100 sm:mx-0 sm:rounded-3xl">
        <img src={event.posterUrl} alt={title} className="aspect-[4/5] w-full object-cover" />
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold leading-tight">{title}</h1>
        <p className="font-semibold text-tent-700">
          {formatLongDate(event.startsAt, lang)} · {formatTime(event.startsAt, lang)}
        </p>
        <p className="text-sm text-stone-500">{ethiopianDate(event.startsAt, lang)}</p>
        <p className="text-sm">
          📍 {event.venue.name} ·{" "}
          <a href={mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-tent-600 underline">
            {t("event.map")}
          </a>
        </p>
        <p className="text-sm text-stone-600">
          {event.organiser.name}
          {event.organiser.status === "approved" && (
            <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              ✓ {t("event.verified")}
            </span>
          )}
        </p>
        <div className="flex gap-2 pt-1">
          <ShareButton lang={lang} title={title} />
          <SaveButton lang={lang} eventId={event.id} initial={saved} loggedIn={!!user} />
        </div>
      </header>

      {event.lineup.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">{t("event.lineup")}</h2>
          <div className="flex flex-wrap gap-2">
            {event.lineup.map((a) => (
              <span key={a} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-tent-200">
                {a}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">{t("event.about")}</h2>
        <p className="whitespace-pre-line leading-relaxed text-stone-700">{eventDesc(event, lang)}</p>
      </section>

      <section id="tickets" className="space-y-2">
        <h2 className="font-bold">{t("event.tickets")}</h2>
        {event.status === "cancelled" ? (
          <p className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">{t("event.cancelled")}</p>
        ) : ended ? (
          <p className="rounded-xl bg-stone-100 p-4 font-semibold text-stone-600">{t("event.ended")}</p>
        ) : (
          <TicketSelector lang={lang} eventId={event.id} slug={event.slug} types={types} loggedIn={!!user} />
        )}
        <p className="text-xs text-stone-500">{t("checkout.reserved")}</p>
      </section>
    </article>
  );
}

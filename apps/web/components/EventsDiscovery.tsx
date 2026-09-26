import { ageGroup } from "@dinkuan/core";
import Link from "next/link";
import type { Lang } from "@dinkuan/i18n";
import { translator } from "@dinkuan/i18n";
import { sponsoredEvents } from "@dinkuan/ads";
import { EventCard } from "@/components/EventCard";
import { viewerKey } from "@/lib/ads";
import { CATEGORIES, findEvents } from "@/lib/events";
import { currentUser } from "@/lib/session";

function Row({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-tent-600">
          →
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">{children}</div>
    </section>
  );
}

/** F4: event discovery rows (the Events tab and the events page). */
export async function EventsDiscovery({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const user = await currentUser();
  const key = await viewerKey(user?.id ?? null);
  const teen = ageGroup(user?.birthDate) === "teen";
  const [featured, tonight, weekend, upcoming, takeover, spotlight] = await Promise.all([
    findEvents({ featured: true, limit: 6 }),
    findEvents({ date: "today", limit: 8 }),
    findEvents({ date: "weekend", limit: 8 }),
    findEvents({ limit: 12 }),
    // F21-AC3: "Weekend Takeover" tops the page; "Event Spotlight" leads the Featured row.
    sponsoredEvents("home_weekend", key, 1, undefined, { teen }),
    sponsoredEvents("events_featured", key, 2, undefined, { teen }),
  ]);
  const top = takeover[0];
  const spot = spotlight.filter((s) => s.event.id !== top?.event.id);
  const featuredRest = featured.filter((e) => !spot.some((s) => s.event.id === e.id) && e.id !== top?.event.id);
  return (
    <div className="space-y-8">
      <form action="/events" className="relative">
        <input
          name="q"
          placeholder={t("search.placeholder")}
          className="tap w-full rounded-2xl border border-tent-200 bg-white px-4 py-3 pr-12 shadow-sm outline-none focus:border-tent-500"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" aria-hidden>
          🔍
        </span>
      </form>

      {user && (
        <Link href="/tickets" className="tap flex items-center justify-between rounded-2xl bg-white px-4 font-semibold ring-1 ring-tent-100">
          <span>🎫 {t("nav.tickets")}</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {top && (
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold">{t("home.weekend")}</h2>
          <EventCard event={top.event} lang={lang} sponsored={{ campaignId: top.campaignId, placement: "home_weekend" }} />
        </section>
      )}

      {featuredRest.length + spot.length > 0 && (
        <Row title={t("home.featured")} href="/events">
          {spot.map((s) => (
            <EventCard key={`ad-${s.campaignId}`} event={s.event} lang={lang} wide sponsored={{ campaignId: s.campaignId, placement: "events_featured" }} />
          ))}
          {featuredRest.map((e) => (
            <EventCard key={e.id} event={e} lang={lang} wide />
          ))}
        </Row>
      )}
      <Row title={t("home.tonight")} href="/events?date=today">
        {tonight.length ? tonight.map((e) => <EventCard key={e.id} event={e} lang={lang} wide />) : <p className="text-stone-500">{t("home.empty")}</p>}
      </Row>
      <Row title={t("home.weekend")} href="/events?date=weekend">
        {weekend.length ? weekend.map((e) => <EventCard key={e.id} event={e} lang={lang} wide />) : <p className="text-stone-500">{t("home.empty")}</p>}
      </Row>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">{t("home.byCategory")}</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/events?category=${c}`}
              className="tap grid place-items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200"
            >
              {t(`category.${c}`)}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">{t("home.upcoming")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} lang={lang} />
          ))}
        </div>
      </section>
    </div>
  );
}

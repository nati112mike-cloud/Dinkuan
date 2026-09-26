import { adClickHref } from "@dinkuan/ads/text";
import { translator, type Lang } from "@dinkuan/i18n";
import { minAllIn, type EventCard } from "@/lib/events";
import { birr, eventTitle, formatDay, formatTime } from "@/lib/format";
import { AdView, SponsoredLabel } from "./Sponsored";

/** A promoted event in the For You feed ("Event Spotlight"), always labelled (F21-AC6). */
export function SponsoredEvent({ event, campaignId, lang }: { event: EventCard; campaignId: string; lang: Lang }) {
  const t = translator(lang);
  const price = minAllIn(event);
  return (
    <AdView campaignId={campaignId} placement="feed">
      <a
        href={adClickHref(campaignId, "feed")}
        className="flex gap-3 overflow-hidden rounded-2xl bg-white p-2 shadow-sm ring-1 ring-tent-100"
        data-testid="sponsored-event"
      >
        <img src={`${event.posterUrl}?size=card`} alt="" className="h-28 w-24 shrink-0 rounded-xl object-cover" />
        <span className="min-w-0 flex-1 space-y-1 py-1">
          <SponsoredLabel />
          <span className="block truncate font-bold">{eventTitle(event, lang)}</span>
          <span className="block text-xs text-stone-500">
            {formatDay(event.startsAt, lang)} · {formatTime(event.startsAt, lang)} · {event.venue.name}
          </span>
          <span className="flex items-center justify-between text-sm font-semibold">
            <span>{price === null ? "" : price === 0 ? t("event.free") : t("event.from", { price: birr(price) })}</span>
            <span className="rounded-full bg-tent-600 px-3 py-1 text-xs text-white">{t("ads.getTickets")}</span>
          </span>
        </span>
      </a>
    </AdView>
  );
}

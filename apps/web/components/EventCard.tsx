import Link from "next/link";
import { adClickHref } from "@dinkuan/ads/text";
import { translator, type Lang } from "@dinkuan/i18n";
import { isSoldOut, minAllIn, type EventCard as EventCardData } from "@/lib/events";
import { birr, eventTitle, formatDay, formatTime } from "@/lib/format";
import type { SponsoredDTO } from "@/lib/social-types";
import { AdView, SponsoredLabel } from "./Sponsored";

export function EventCard({
  event,
  lang,
  wide = false,
  sponsored,
}: {
  event: EventCardData;
  lang: Lang;
  wide?: boolean;
  sponsored?: SponsoredDTO;
}) {
  const t = translator(lang);
  const price = minAllIn(event);
  const soldOut = isSoldOut(event);
  const card = (
    <Link
      href={sponsored ? adClickHref(sponsored.campaignId, sponsored.placement) : `/e/${event.slug}`}
      prefetch={sponsored ? false : undefined}
      className={`group block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-tent-100 ${wide ? "w-72 shrink-0" : ""}`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-tent-100">
        <img
          src={`${event.posterUrl}?size=card`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
        {soldOut && (
          <span className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-1 text-xs font-bold text-white">
            {t("event.soldOut")}
          </span>
        )}
        {sponsored && <SponsoredLabel className="absolute bottom-2 left-2" />}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-tent-600">
          {formatDay(event.startsAt, lang)} · {formatTime(event.startsAt, lang)}
        </p>
        <h3 className="line-clamp-2 font-bold leading-snug">{eventTitle(event, lang)}</h3>
        <p className="truncate text-sm text-stone-500">{event.venue.name}</p>
        <p className="text-sm font-semibold">
          {price === null ? "" : price === 0 ? t("event.free") : t("event.from", { price: birr(price) })}
        </p>
      </div>
    </Link>
  );
  return sponsored ? (
    <AdView campaignId={sponsored.campaignId} placement={sponsored.placement} className={wide ? "shrink-0" : undefined}>
      {card}
    </AdView>
  ) : (
    card
  );
}

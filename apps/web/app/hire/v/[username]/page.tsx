import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import {
  addisToday,
  formatStars,
  getVendorPage,
  shortlistedIds,
  unavailableDates,
  VENDOR_TYPE_ICON,
  vendorReviews,
  type VendorTypeKey,
} from "@dinkuan/marketplace";
import { profilePosts } from "@dinkuan/social";
import { AvailabilityCalendar } from "@/components/AvailabilityCalendar";
import { Avatar } from "@/components/Avatar";
import { Caption } from "@/components/Caption";
import { CompareBar, CompareToggle } from "@/components/CompareBar";
import { PostGrid } from "@/components/PostGrid";
import { ShareVendor } from "@/components/ShareVendor";
import { ShortlistButton } from "@/components/ShortlistButton";
import { LevelBadge, Stars } from "@/components/VendorCard";
import { birr, eventTitle, formatDay } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

export const dynamic = "force-dynamic";

type Params = Promise<{ username: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await getVendorPage((await params).username, null);
  if (!page) return {};
  const title = `${page.profile.displayName || page.profile.username} · ${page.vendor.headline}`;
  return { title, description: page.vendor.about ?? page.vendor.headline, openGraph: { title, description: page.vendor.headline } };
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 space-y-3">
      <h2 className="text-lg font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/** Vendor pro profile (PRD 6): About · Portfolio · Packages · Reviews · Stages · Posts. */
export default async function VendorPage({ params }: { params: Params }) {
  const { username } = await params;
  const user = await currentUser();
  const viewer = user?.id ?? null;
  const page = await getVendorPage(username, viewer);
  if (!page) notFound();
  const { profile, vendor, verifiedGigs } = page;
  const { lang, t } = await getT();
  const today = addisToday();
  const in60 = new Date(Date.now() + 70 * 86_400_000).toISOString().slice(0, 10);
  const [reviews, off, saved, posts] = await Promise.all([
    vendorReviews(vendor.userId, viewer, 10),
    unavailableDates(vendor.userId, today, in60),
    shortlistedIds(viewer),
    profilePosts(vendor.userId, "posts", viewer, null, 9),
  ]);
  const isOwner = viewer === vendor.userId;
  const name = profile.displayName || profile.username;
  const cover = vendor.coverUrl ?? vendor.albums[0]?.coverUrl ?? null;
  const fact = (k: MessageKey, v: React.ReactNode) => (
    <div className="rounded-xl bg-tent-50 p-2">
      <dt className="text-xs text-stone-500">{t(k)}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
  const nav: [string, MessageKey][] = [
    ["about", "vendor.about"],
    ["portfolio", "vendor.portfolio"],
    ["packages", "vendor.packages"],
    ["reviews", "vendor.reviews"],
    ["stages", "vendor.stages"],
    ["posts", "vendor.posts"],
  ];

  return (
    <div className="space-y-6 pb-28">
      <div className="-mx-4 -mt-4 aspect-[16/7] bg-gradient-to-br from-tent-400 to-tent-800 sm:mx-0 sm:rounded-b-3xl">
        {cover && <img src={cover} alt="" className="h-full w-full object-cover sm:rounded-b-3xl" />}
      </div>
      <div className="-mt-16 space-y-2">
        <span className="inline-block rounded-full ring-4 ring-tent-50">
          <Avatar profile={{ ...profile, displayName: name }} size={88} />
        </span>
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
            {name}
            {profile.isVerified && <span className="text-sky-600">✓</span>}
            <LevelBadge level={vendor.level} lang={lang} />
          </h1>
          <p className="text-stone-600">{vendor.headline}</p>
          <p className="flex flex-wrap items-center gap-x-3 text-sm">
            <Stars ratingAvg={vendor.ratingAvg} ratingCount={vendor.ratingCount} lang={lang} />
            <span className="text-stone-500">{vendor.types.map((x) => `${VENDOR_TYPE_ICON[x as VendorTypeKey]} ${t(`vendorType.${x}` as MessageKey)}`).join(" · ")}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ShortlistButton lang={lang} vendorId={vendor.userId} initial={saved.has(vendor.userId)} loggedIn={!!user} big />
          <span className="flex overflow-hidden rounded-full bg-white ring-1 ring-tent-200">
            <CompareToggle lang={lang} vendor={{ id: vendor.userId, name }} />
          </span>
          <ShareVendor lang={lang} username={profile.username} name={name} />
          <Link href={`/u/${profile.username}`} className="tap grid place-items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200">
            @{profile.username}
          </Link>
          {isOwner && (
            <>
              <Link href="/vendor" className="tap grid place-items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200">
                ✏️ {t("vendor.manage")}
              </Link>
              <Link href={`/promote?type=profile&id=${vendor.userId}`} className="tap grid place-items-center rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200">
                📣 {t("promote.cta")}
              </Link>
            </>
          )}
        </div>
      </div>

      <nav className="no-scrollbar sticky top-[60px] z-10 -mx-4 flex gap-1 overflow-x-auto bg-tent-50/95 px-4 py-2 backdrop-blur" aria-label={name}>
        {nav.map(([id, key]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-tent-100">
            {t(key)}
          </a>
        ))}
      </nav>

      <Section id="about" title={t("vendor.about")}>
        {vendor.about && <Caption text={vendor.about} />}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          {fact("vendor.experience", t("vendor.years", { n: vendor.yearsExperience }))}
          {fact("vendor.responseTime", vendor.responseTimeMin === null ? "—" : vendor.responseTimeMin < 60 ? t("vendor.minutes", { n: vendor.responseTimeMin }) : t("vendor.hours", { n: Math.round(vendor.responseTimeMin / 60) }))}
          {fact("vendor.teamSize", vendor.teamSize)}
          {fact("vendor.verifiedGigs", verifiedGigs)}
          {vendor.genres.length > 0 && fact("vendor.genres", vendor.genres.join(", "))}
          {vendor.languages.length > 0 && fact("vendor.languages", vendor.languages.join(", "))}
          {vendor.areas.length > 0 && fact("vendor.areas", vendor.areas.join(", "))}
          {vendor.services.length > 0 && fact("vendor.services", vendor.services.join(", "))}
        </dl>
        {vendor.equipment.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-bold">{t("vendor.equipment")}</p>
            <ul className="flex flex-wrap gap-1 text-xs">
              {vendor.equipment.map((e) => (
                <li key={e} className="rounded-full bg-white px-2 py-1 ring-1 ring-tent-100">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
        {vendor.socialLinks.length > 0 && (
          <p className="flex flex-wrap gap-3 text-sm">
            {vendor.socialLinks.map((l) => (
              <a key={l} href={l} target="_blank" rel="noreferrer nofollow" className="font-semibold text-tent-600">
                🔗 {l.replace(/^https?:\/\//, "")}
              </a>
            ))}
          </p>
        )}
      </Section>

      <Section id="availability" title={t("vendor.availability")}>
        <AvailabilityCalendar
          lang={lang}
          today={today}
          unavailable={off}
          hrefFor={isOwner ? undefined : (d) => `/hire/request/${profile.username}?date=${d}`}
        />
      </Section>

      <Section id="portfolio" title={t("vendor.portfolio")}>
        {vendor.albums.length === 0 ? (
          <p className="text-stone-500">{t("vendor.noPortfolio")}</p>
        ) : (
          <div className="space-y-4">
            {vendor.albums.map((a) => (
              <article key={a.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold">{a.title}</h3>
                  {a.gigStatus === "verified" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">✓ {t("vendor.verifiedGig")}</span>
                  )}
                </div>
                {a.event && (
                  <Link href={`/e/${a.event.slug}`} className="text-xs font-semibold text-tent-700">
                    🎟 {eventTitle(a.event, lang)} · {a.event.venue.name} · {formatDay(a.event.startsAt, lang)}
                  </Link>
                )}
                <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4">
                  {a.items.map((i) =>
                    i.kind === "video" ? (
                      <video key={i.id} src={i.url} poster={i.thumbUrl ?? undefined} controls playsInline preload="none" className="h-48 shrink-0 snap-start rounded-xl bg-black" />
                    ) : (
                      <img key={i.id} src={i.url} alt={i.caption ?? ""} loading="lazy" className="h-48 shrink-0 snap-start rounded-xl object-cover" style={{ aspectRatio: `${i.width} / ${i.height}` }} />
                    ),
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section id="packages" title={t("vendor.packages")}>
        {vendor.packages.length === 0 ? (
          <p className="text-stone-500">{t("vendor.noPackages")}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {vendor.packages.map((p) => (
              <article key={p.id} className={`space-y-2 rounded-2xl bg-white p-4 ring-1 ${p.tier === "standard" ? "ring-2 ring-tent-500" : "ring-tent-100"}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-tent-600">{t(`tier.${p.tier}` as MessageKey)}</p>
                <h3 className="font-bold">{p.name}</h3>
                <p className="text-2xl font-extrabold">{birr(p.priceSantim)} <span className="text-sm font-semibold">{t("common.birr")}</span></p>
                <p className="text-sm text-stone-500">{t("vendor.hoursIncluded", { n: p.hours })}</p>
                <ul className="space-y-1 text-sm">
                  {p.includes.map((x) => (
                    <li key={x}>✓ {x}</li>
                  ))}
                </ul>
                {p.addons.length > 0 && (
                  <div className="space-y-1 border-t border-tent-100 pt-2 text-xs text-stone-600">
                    <p className="font-bold">{t("vendor.addons")}</p>
                    {p.addons.map((a) => (
                      <p key={a.id} className="flex justify-between">
                        <span>+ {a.name}</span>
                        <span>{birr(a.priceSantim)}</span>
                      </p>
                    ))}
                  </div>
                )}
                {isOwner ? (
                  <Link href={`/promote?type=package&id=${p.id}`} className="tap grid place-items-center rounded-xl bg-tent-50 text-sm font-semibold text-tent-700">
                    📣 {t("promote.cta")}
                  </Link>
                ) : (
                  <Link href={`/hire/request/${profile.username}?package=${p.id}`} className="tap grid place-items-center rounded-xl bg-tent-600 text-sm font-bold text-white">
                    {t("vendor.choose")}
                  </Link>
                )}
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section id="reviews" title={`${t("vendor.reviews")}${vendor.ratingCount ? ` · ★ ${formatStars(vendor.ratingAvg)} (${vendor.ratingCount})` : ""}`}>
        {reviews.items.length === 0 ? (
          <p className="text-stone-500">{t("hire.noReviews")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              {(["punctuality", "quality", "value", "communication"] as const).map((k) => (
                <div key={k} className="flex justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-tent-100">
                  <dt>{t(`review.${k}` as MessageKey)}</dt>
                  <dd className="font-bold">★ {reviews.subRatings[k] ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <ul className="space-y-3">
              {reviews.items.map((r) => (
                <li key={r.id} className="space-y-1 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
                  <p className="flex items-center justify-between text-sm">
                    <span className="font-bold">{r.client.profile?.displayName || r.client.profile?.username}</span>
                    <span className="text-amber-500">{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                  </p>
                  <p className="text-sm">{r.body}</p>
                  {r.vendorReply && (
                    <p className="rounded-xl bg-tent-50 p-2 text-xs">
                      <span className="font-bold">{t("review.reply", { name })}</span> {r.vendorReply}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section id="stages" title={t("vendor.stages")}>
        {vendor.credits.length === 0 ? (
          <p className="text-stone-500">{t("vendor.noStages")}</p>
        ) : (
          <ul className="space-y-1">
            {vendor.credits.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-tent-100">
                <span>🎪 {c.name}</span>
                {c.verified ? (
                  <span className="text-xs font-bold text-emerald-700">✓ {t("vendor.verified")}</span>
                ) : (
                  <span className="text-xs text-stone-400">{t("vendor.selfReported")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="posts" title={t("vendor.posts")}>
        {posts.items.length === 0 ? (
          <p className="text-stone-500">{t("profile.noPosts")}</p>
        ) : (
          <PostGrid posts={posts.items.map((p) => toPostDTO(p, viewer, lang))} />
        )}
        <Link href={`/u/${profile.username}`} className="block text-center text-sm font-semibold text-tent-600">
          {t("vendor.seeAllPosts")} →
        </Link>
      </Section>

      {!isOwner && (
        <div className="fixed inset-x-0 bottom-[64px] z-20 px-4">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-2xl bg-white p-2 pl-4 shadow-lg ring-1 ring-tent-200">
            <span className="min-w-0 flex-1">
              {vendor.startingPriceSantim !== null && (
                <span className="block text-sm font-bold">{t("hire.from", { price: birr(vendor.startingPriceSantim) })}</span>
              )}
              <span className="block text-xs text-stone-500">{t("vendor.freeToAsk")}</span>
            </span>
            <Link href={`/hire/request/${profile.username}`} className="tap grid place-items-center rounded-xl bg-tent-600 px-5 font-bold text-white">
              {t("vendor.request")}
            </Link>
          </div>
        </div>
      )}
      <CompareBar lang={lang} raised={!isOwner} />
    </div>
  );
}

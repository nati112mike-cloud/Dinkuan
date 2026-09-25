import Link from "next/link";
import { followingFeed, forYouFeed } from "@dinkuan/social";
import { EventsDiscovery } from "@/components/EventsDiscovery";
import { Feed } from "@/components/Feed";
import { currentUser, getT } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

export const dynamic = "force-dynamic";

type Tab = "foryou" | "following" | "events";

/** F16-AC1: Home tabs For You · Following · Events. */
export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab: Tab = raw === "following" || raw === "events" ? raw : "foryou";
  const { lang, t } = await getT();
  const user = await currentUser();
  const viewer = user?.id ?? null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "foryou", label: t("feed.forYou") },
    { key: "following", label: t("feed.following") },
    { key: "events", label: t("feed.events") },
  ];

  let body: React.ReactNode;
  if (tab === "events") {
    body = <EventsDiscovery lang={lang} />;
  } else if (tab === "following" && !viewer) {
    body = (
      <div className="space-y-3 py-8 text-center">
        <p className="text-stone-600">{t("feed.loginForFollowing")}</p>
        <Link href="/login?next=/?tab=following" className="tap inline-grid place-items-center rounded-full bg-tent-600 px-6 font-semibold text-white">
          {t("nav.login")}
        </Link>
      </div>
    );
  } else {
    const page = tab === "following" ? await followingFeed(viewer!) : await forYouFeed(viewer);
    const initial = { items: page.items.map((p) => toPostDTO(p, viewer, lang)), nextCursor: page.nextCursor };
    body = (
      <Feed
        key={tab}
        initial={initial}
        endpoint={`/api/feed?tab=${tab}`}
        lang={lang}
        loggedIn={!!user}
        empty={
          <div className="space-y-3 py-8 text-center">
            <p className="text-stone-600">{t("feed.empty")}</p>
            <Link href="/people" className="tap inline-grid place-items-center rounded-full bg-tent-600 px-6 font-semibold text-white">
              {t("feed.findPeople")}
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <nav className="sticky top-[53px] z-10 -mx-4 flex bg-tent-50/95 px-4 backdrop-blur" aria-label="Feed">
        {tabs.map((x) => (
          <Link
            key={x.key}
            href={x.key === "foryou" ? "/" : `/?tab=${x.key}`}
            aria-current={tab === x.key ? "page" : undefined}
            className={`tap flex-1 border-b-2 text-center font-bold leading-[44px] ${
              tab === x.key ? "border-tent-600 text-tent-700" : "border-transparent text-stone-500"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}

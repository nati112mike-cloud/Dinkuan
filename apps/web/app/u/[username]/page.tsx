import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import { getProfileView, profileEvents, profilePosts } from "@dinkuan/social";
import { Avatar } from "@/components/Avatar";
import { Caption } from "@/components/Caption";
import { FollowButton } from "@/components/FollowButton";
import { PostGrid } from "@/components/PostGrid";
import { ProfileMenu } from "@/components/ProfileMenu";
import { eventTitle, formatDay } from "@/lib/format";
import { compactNumber } from "@/lib/client";
import { currentUser, getT } from "@/lib/session";
import { toPostDTO } from "@/lib/social";

export const dynamic = "force-dynamic";

type Params = Promise<{ username: string }>;
const TABS = ["posts", "reels", "events", "tagged"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { username } = await params;
  const view = await getProfileView(username, null);
  if (!view) return {};
  const { profile } = view;
  const title = `${profile.displayName || profile.username} (@${profile.username})`;
  const description = profile.bio ?? `${profile.followersCount} followers · ${profile.postsCount} posts on Dinkuan`;
  // F14-AC7: Open Graph preview for shared profile links.
  return { title, description, openGraph: { title, description, type: "profile", images: [`/u/${profile.username}/card`] } };
}

export default async function ProfilePage({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string }> }) {
  const { username } = await params;
  const { tab: raw } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(raw ?? "") ? (raw as Tab) : "posts";
  const user = await currentUser();
  const viewer = user?.id ?? null;
  const view = await getProfileView(username, viewer);
  if (!view) notFound();
  const { profile, rel, canSeePosts, badges } = view;
  const { lang, t } = await getT();

  let content: React.ReactNode = null;
  if (!canSeePosts) {
    content = (
      <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-tent-100">
        <p className="text-3xl">🔒</p>
        <p className="font-bold">{t("profile.private")}</p>
        <p className="text-sm text-stone-500">{t("profile.privateHint")}</p>
      </div>
    );
  } else if (tab === "events") {
    const events = profile.showEvents || rel.isSelf ? await profileEvents(profile.userId) : null;
    content = !events ? (
      <p className="text-stone-500">{t("profile.eventsHidden")}</p>
    ) : events.length === 0 ? (
      <p className="text-stone-500">{t("home.empty")}</p>
    ) : (
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id}>
            <Link href={`/e/${e.slug}`} className="flex items-center gap-3 rounded-2xl bg-white p-2 ring-1 ring-tent-100">
              <img src={`${e.posterUrl}?size=card`} alt="" className="h-16 w-14 rounded-xl object-cover" />
              <span className="min-w-0">
                <span className="block truncate font-bold">{eventTitle(e, lang)}</span>
                <span className="block text-sm text-stone-500">
                  {formatDay(e.startsAt, lang)} · {e.venue.name}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  } else {
    const page = await profilePosts(profile.userId, tab, viewer, null, 60);
    const posts = page.items.map((p) => toPostDTO(p, viewer, lang));
    content = posts.length ? <PostGrid posts={posts} /> : <p className="py-6 text-center text-stone-500">{t("profile.noPosts")}</p>;
  }

  const stat = (n: number, key: MessageKey, href?: string) => {
    const inner = (
      <>
        <span className="block text-lg font-extrabold">{compactNumber(n, lang)}</span>
        <span className="text-xs text-stone-500">{t(key)}</span>
      </>
    );
    return href && canSeePosts ? (
      <Link href={href} className="text-center">
        {inner}
      </Link>
    ) : (
      <span className="text-center">{inner}</span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="-mx-4 -mt-4 h-32 bg-gradient-to-br from-tent-400 to-tent-700 sm:mx-0 sm:rounded-b-3xl">
        {profile.coverUrl && <img src={profile.coverUrl} alt="" className="h-full w-full object-cover sm:rounded-b-3xl" />}
      </div>
      <div className="-mt-14 flex items-end justify-between gap-3">
        <span className="rounded-full ring-4 ring-tent-50">
          <Avatar profile={{ ...profile, displayName: profile.displayName || profile.username }} size={88} />
        </span>
        <div className="flex items-center gap-2 pb-1">
          {rel.isSelf ? (
            <Link href="/settings" className="tap grid place-items-center rounded-full bg-white px-5 font-semibold ring-1 ring-tent-200">
              {t("profile.edit")}
            </Link>
          ) : (
            <FollowButton lang={lang} userId={profile.userId} initial={rel.following} followsYou={rel.followsYou} loggedIn={!!user} />
          )}
          <ProfileMenu lang={lang} userId={profile.userId} username={profile.username} isSelf={rel.isSelf} muted={rel.muted} loggedIn={!!user} />
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-extrabold leading-tight">
          {profile.displayName || profile.username}
          {profile.isVerified && <span className="ml-1 text-sky-600">✓</span>}
        </h1>
        <p className="text-sm text-stone-500">
          @{profile.username}
          {profile.isPrivate && " · 🔒"}
          {rel.followsYou && !rel.isSelf && <span className="ml-2 rounded bg-stone-100 px-1.5 text-xs">{t("profile.followsYou")}</span>}
        </p>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {badges.map((b) => (
              <span key={b} className="rounded-full bg-tent-100 px-2 py-0.5 text-xs font-semibold text-tent-700">
                {b === "verified" ? "✓ " : b === "creator" ? "★ " : "🎪 "}
                {t(`badge.${b}`)}
              </span>
            ))}
          </div>
        )}
        {profile.bio && <Caption text={profile.bio} className="pt-1" />}
        <p className="flex flex-wrap gap-x-3 text-sm">
          {profile.subCity && <span className="text-stone-500">📍 {profile.subCity}</span>}
          {profile.link && (
            <a href={profile.link} target="_blank" rel="noreferrer nofollow" className="font-semibold text-tent-600">
              🔗 {profile.link.replace(/^https?:\/\//, "")}
            </a>
          )}
        </p>
      </div>

      <div className="grid grid-cols-4 rounded-2xl bg-white py-3 ring-1 ring-tent-100">
        {stat(profile.postsCount, "profile.posts")}
        {stat(profile.followersCount, "profile.followers", `/u/${profile.username}/followers`)}
        {stat(profile.followingCount, "profile.followingCount", `/u/${profile.username}/following`)}
        {stat(profile.likesReceived, "profile.likes")}
      </div>
      {rel.isSelf && (
        <Link href="/profile" className="block text-center text-sm font-semibold text-tent-600">
          {t("profile.account")} →
        </Link>
      )}

      <nav className="flex border-b border-tent-100" aria-label="Profile">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/u/${profile.username}${x === "posts" ? "" : `?tab=${x}`}`}
            aria-current={tab === x ? "page" : undefined}
            className={`tap flex-1 border-b-2 text-center text-sm font-bold leading-[44px] ${tab === x ? "border-tent-600 text-tent-700" : "border-transparent text-stone-500"}`}
          >
            {t(`profile.${x}` as MessageKey)}
          </Link>
        ))}
      </nav>
      {content}
    </div>
  );
}

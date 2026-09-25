import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { blockedList, followRequests } from "@dinkuan/social";
import { Avatar } from "@/components/Avatar";
import { RequestActions } from "@/components/RequestActions";
import { SettingsForm } from "@/components/SettingsForm";
import { getT, isAdmin } from "@/lib/session";
import { currentMember, toProfileDTO } from "@/lib/social";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/settings");
  const { lang, t } = await getT();
  const { profile } = me;
  const [requests, blocked] = await Promise.all([followRequests(me.user.id), blockedList(me.user.id)]);
  const row = (p: (typeof requests)[number], mode: "request" | "blocked") => {
    const dto = toProfileDTO(p);
    return (
      <li key={p.userId} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
        <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar profile={dto} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-bold">{dto.displayName}</span>
            <span className="block truncate text-sm text-stone-500">@{p.username}</span>
          </span>
        </Link>
        <RequestActions lang={lang} userId={p.userId} mode={mode} />
      </li>
    );
  };
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{t("settings.title")}</h1>
        <Link href="/saved" className="text-sm font-semibold text-tent-600">
          🔖 {t("settings.savedPosts")}
        </Link>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm font-semibold">
        <Link href="/organiser" className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
          🎪 {t("settings.organiser")}
        </Link>
        {isAdmin(me.user) && (
          <Link href="/admin" className="tap flex items-center rounded-xl bg-white px-3 ring-1 ring-tent-200">
            🛡 {t("admin.title")}
          </Link>
        )}
      </nav>
      <SettingsForm
        lang={lang}
        initial={{
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio ?? "",
          link: profile.link ?? "",
          subCity: profile.subCity ?? "",
          avatarUrl: profile.avatarUrl,
          coverUrl: profile.coverUrl,
          isPrivate: profile.isPrivate,
          showEvents: profile.showEvents,
          lowDataMode: profile.lowDataMode,
          creatorMode: profile.creatorMode,
          hiddenWords: profile.hiddenWords,
        }}
      />
      <section id="requests" className="space-y-3">
        <h2 className="text-lg font-bold">{t("settings.requests")}</h2>
        {requests.length ? <ul className="space-y-2">{requests.map((p) => row(p, "request"))}</ul> : <p className="text-stone-500">{t("settings.noRequests")}</p>}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("settings.blocked")}</h2>
        {blocked.length ? <ul className="space-y-2">{blocked.map((p) => row(p, "blocked"))}</ul> : <p className="text-stone-500">{t("settings.noBlocked")}</p>}
      </section>
    </div>
  );
}

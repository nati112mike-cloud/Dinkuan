import { notFound } from "next/navigation";
import { followList, followStates, getProfileView } from "@dinkuan/social";
import { PeopleList } from "@/components/PeopleList";
import { currentUser, getT } from "@/lib/session";
import { toProfileDTO } from "@/lib/social";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const user = await currentUser();
  const view = await getProfileView(username, user?.id ?? null);
  if (!view || !view.canSeePosts) notFound();
  const { lang, t } = await getT();
  const people = await followList(view.profile.userId, "following", user?.id ?? null);
  const states = await followStates(user?.id ?? null, people.map((p) => p.userId));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">
        @{view.profile.username} · {t("profile.followingCount")}
      </h1>
      <PeopleList lang={lang} people={people.map((p) => ({ profile: toProfileDTO(p), reason: null, following: states.get(p.userId) ?? "none" }))} viewerId={user?.id ?? null} />
    </div>
  );
}

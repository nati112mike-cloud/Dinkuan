import type { Metadata } from "next";
import { followStates, popularPeople, suggestPeople } from "@dinkuan/social";
import { InviteCard } from "@/components/InviteCard";
import { PeopleList } from "@/components/PeopleList";
import { PeopleSearch } from "@/components/PeopleSearch";
import { getT } from "@/lib/session";
import { currentMember, toProfileDTO } from "@/lib/social";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "People" };

/** F17: find people, suggestions and invites. */
export default async function PeoplePage() {
  const { lang, t } = await getT();
  const me = await currentMember();
  const viewer = me?.user.id ?? null;
  const rows = viewer
    ? (await suggestPeople(viewer, 20)).map((s) => ({ profile: toProfileDTO(s.profile), reason: s.reason as string | null }))
    : (await popularPeople(20)).map((p) => ({ profile: toProfileDTO(p), reason: "popular" as string | null }));
  const states = await followStates(viewer, rows.map((r) => r.profile.userId));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t("people.title")}</h1>
      <PeopleSearch lang={lang} viewerId={viewer}>
        <section className="space-y-3">
          <h2 className="font-bold">{t("people.suggested")}</h2>
          <PeopleList lang={lang} people={rows.map((r) => ({ ...r, following: states.get(r.profile.userId) ?? "none" }))} viewerId={viewer} />
        </section>
      </PeopleSearch>
      {me && <InviteCard lang={lang} code={me.profile.referralCode} />}
    </div>
  );
}

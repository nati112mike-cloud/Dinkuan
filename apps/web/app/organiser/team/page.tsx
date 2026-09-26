import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { organiserAccess, teamOf } from "@dinkuan/core/server";
import { TeamForm } from "@/components/TeamForm";
import { currentUser, getT } from "@/lib/session";
import { pickOrganiser } from "../org";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Team" };

/** F2-AC5: managers and door scanners. */
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/organiser/team");
  const { org } = await pickOrganiser(user.id, (await searchParams).org);
  if (!org || org.status !== "approved") redirect("/organiser");
  const { lang, t } = await getT();
  const [team, access] = await Promise.all([teamOf(org.id), organiserAccess(user.id, org.id)]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("organiser.team")}</h1>
      <p className="text-sm text-stone-500">{t("team.intro")}</p>
      <TeamForm
        lang={lang}
        organiserId={org.id}
        canAddManager={access === "owner" || access === "admin"}
        team={team.map((m) => ({ userId: m.userId, name: m.user.profile?.displayName ?? m.user.name ?? "", phone: m.user.phone, role: m.role }))}
      />
    </div>
  );
}

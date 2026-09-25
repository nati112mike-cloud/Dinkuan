import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Welcome } from "@/components/Welcome";
import { getT } from "@/lib/session";
import { currentMember } from "@/lib/social";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const me = await currentMember();
  if (!me) redirect("/login?next=/welcome");
  const { lang } = await getT();
  return <Welcome lang={lang} username={me.profile.username} next="/" />;
}

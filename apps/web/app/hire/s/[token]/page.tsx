import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shortlistByToken, shortlistedIds } from "@dinkuan/marketplace";
import { CompareBar } from "@/components/CompareBar";
import { ShortlistView } from "@/components/ShortlistView";
import { toVendorCard } from "@/lib/market";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shortlist", robots: { index: false } };

/** F20-AC13: a shared shortlist; anyone with the link can look, no account needed. */
export default async function SharedShortlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUser();
  const list = await shortlistByToken(token, user?.id ?? null);
  if (!list) notFound();
  const { lang, t } = await getT();
  const saved = await shortlistedIds(user?.id ?? null);
  const owner = list.user.profile?.displayName || list.user.profile?.username || "";
  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-2xl font-extrabold">{t("shortlist.sharedTitle", { name: owner })}</h1>
      <ShortlistView lang={lang} cards={list.items.map((i) => toVendorCard(i.vendor, { saved: saved.has(i.vendorId) }))} loggedIn={!!user} />
      <CompareBar lang={lang} />
    </div>
  );
}

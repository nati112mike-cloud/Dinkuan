import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { myShortlist } from "@dinkuan/marketplace";
import { CompareBar } from "@/components/CompareBar";
import { TelegramShare } from "@/components/ShareVendor";
import { ShortlistView } from "@/components/ShortlistView";
import { toVendorCard } from "@/lib/market";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shortlist" };

/** F20-AC13: your shortlist, shareable with family on Telegram. */
export default async function ShortlistPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/hire/shortlist");
  const { lang, t } = await getT();
  const list = await myShortlist(user.id);
  const cards = list.items.map((i) => toVendorCard(i.vendor, { saved: true }));
  return (
    <div className="space-y-4 pb-16">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">♥ {t("hire.myShortlist")}</h1>
        {cards.length > 0 && <TelegramShare lang={lang} path={`/hire/s/${list.shareToken}`} text={t("shortlist.shareText")} label={t("shortlist.share")} />}
      </div>
      <p className="text-sm text-stone-500">{t("shortlist.hint")}</p>
      <ShortlistView lang={lang} cards={cards} loggedIn />
      <CompareBar lang={lang} />
    </div>
  );
}

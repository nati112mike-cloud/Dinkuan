import Link from "next/link";
import type { Lang } from "@dinkuan/i18n";
import { translator } from "@dinkuan/i18n";
import type { VendorCardDTO } from "@/lib/market-types";
import { VendorCard } from "./VendorCard";

export function ShortlistView({ lang, cards, loggedIn }: { lang: Lang; cards: VendorCardDTO[]; loggedIn: boolean }) {
  const t = translator(lang);
  if (cards.length === 0) {
    return (
      <p className="py-6 text-center text-stone-500">
        {t("shortlist.empty")}{" "}
        <Link href="/hire" className="font-semibold text-tent-600">
          {t("hire.title")} →
        </Link>
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((v) => (
        <VendorCard key={v.userId} v={v} lang={lang} availableOn={null} loggedIn={loggedIn} />
      ))}
    </div>
  );
}

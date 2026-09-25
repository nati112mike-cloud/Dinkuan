import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adReviewQueue } from "@dinkuan/ads";
import { ActionButton } from "@/components/ActionButton";
import { birr } from "@/lib/format";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ad review" };

/** F21-AC5: paid promotions wait here for a moderator before they run. */
export default async function AdReviewPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/ads");
  if (!isAdmin(user)) notFound();
  const { lang, t } = await getT();
  const queue = await adReviewQueue();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("adReview.title")}</h1>
      {queue.length === 0 && <p className="text-stone-500">{t("adReview.empty")}</p>}
      <ul className="space-y-3">
        {queue.map(({ campaign: c, targetLabel, targetLive, screening }) => (
          <li key={c.id} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="ad-review-item">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-bold">{lang === "am" ? c.package.nameAm : c.package.nameEn}</span>
              <span className="text-sm">{birr(c.budgetSantim)} {t("common.birr")}</span>
            </div>
            <p className="text-sm">
              {targetLabel ?? "—"} · @{c.advertiser.profile?.username ?? "?"}
            </p>
            <p className={`text-xs font-semibold ${screening.status === "public" && targetLive ? "text-emerald-700" : "text-rose-700"}`}>
              {screening.status === "public" && targetLive ? t("adReview.checkOk") : t("adReview.checkFail")}
            </p>
            <Link href={`/promote/c/${c.id}`} className="text-sm font-semibold text-tent-700">
              {t("adReview.details")}
            </Link>
            <div className="flex gap-2">
              <ActionButton lang={lang} url={`/api/admin/promotions/${c.id}`} body={{ approve: true }} label="adReview.approve" />
              <ActionButton
                lang={lang}
                url={`/api/admin/promotions/${c.id}`}
                body={{ approve: false, note: "Does not meet ad rules" }}
                label="adReview.reject"
                confirm="adReview.rejectConfirm"
                tone="danger"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

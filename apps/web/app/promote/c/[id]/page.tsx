import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { campaignResults } from "@dinkuan/ads";
import { DomainError } from "@dinkuan/core";
import { unspentSantim, verifyCampaignWithGateway } from "@dinkuan/core/server";
import type { MessageKey } from "@dinkuan/i18n";
import { ActionButton } from "@/components/ActionButton";
import { birr, formatDay } from "@/lib/format";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promotion results" };

/**
 * The gateway's return page for a promotion, and its results (F21-AC7). Payment is confirmed by
 * a server-side verify here, never by the redirect itself (CLAUDE.md rule 2).
 */
export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/promote/c/${id}`);
  const { lang, t } = await getT();
  const admin = isAdmin(user);
  let results;
  try {
    results = await campaignResults({ id: user.id, isAdmin: admin }, id);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  if (results.campaign.status === "pending_payment") {
    await verifyCampaignWithGateway(id);
    results = await campaignResults({ id: user.id, isAdmin: admin }, id);
  }
  const c = results.campaign;
  const stoppable = c.advertiserId === user.id && (c.status === "active" || c.status === "pending_review");
  const refundNow = stoppable ? unspentSantim(c) : 0;
  const stat = (label: MessageKey, value: string) => (
    <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-tent-100">
      <div className="text-2xl font-extrabold">{value}</div>
      <div className="text-xs text-stone-500">{t(label)}</div>
    </div>
  );
  const maxDay = Math.max(1, ...results.daily.map((d) => d.impressions));
  return (
    <div className="space-y-5">
      <div>
        <Link href="/promote" className="text-sm font-semibold text-tent-700">
          ‹ {t("promote.mine")}
        </Link>
        <h1 className="text-2xl font-extrabold">{lang === "am" ? c.package.nameAm : c.package.nameEn}</h1>
        {results.targetLabel && <p className="truncate text-stone-600">{results.targetLabel}</p>}
      </div>
      <p className="rounded-2xl bg-tent-50 p-3 text-sm font-semibold" data-testid="campaign-status">
        {t(`campaign.status.${c.status}` as MessageKey)}
        {c.status === "pending_review" && ` · ${t("campaign.reviewHint")}`}
        {c.endsAt && c.status === "active" && ` · ${t("campaign.until", { date: formatDay(c.endsAt, lang) })}`}
        {c.reviewNote && ` · ${c.reviewNote}`}
      </p>
      <div className="grid grid-cols-2 gap-2" data-testid="campaign-results">
        {stat("campaign.impressions", c.impressions.toLocaleString())}
        {stat("campaign.reach", c.reach.toLocaleString())}
        {stat("campaign.clicks", c.clicks.toLocaleString())}
        {stat("campaign.ctr", `${(results.ctrBps / 100).toFixed(1)}%`)}
        {stat("campaign.ticketSales", String(results.conversions.ticket_sale ?? 0))}
        {stat("campaign.bookingRequests", String(results.conversions.booking_request ?? 0))}
      </div>
      {results.daily.length > 0 && (
        <section className="space-y-1">
          <h2 className="font-bold">{t("campaign.daily")}</h2>
          <ul className="space-y-1">
            {results.daily.map((d) => (
              <li key={d.day} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-stone-500">{d.day.slice(5)}</span>
                <span className="h-3 rounded bg-tent-600" style={{ width: `${Math.max(2, (d.impressions / maxDay) * 100)}%` }} />
                <span>{d.impressions}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-stone-600">
        {t("campaign.paid", { amount: `${birr(c.budgetSantim)} ${t("common.birr")}` })}
        {c.refundedSantim > 0 && ` · ${t("campaign.refunded", { amount: `${birr(c.refundedSantim)} ${t("common.birr")}` })}`}
      </p>
      {stoppable && (
        <div className="space-y-1">
          <ActionButton lang={lang} url={`/api/promotions/${c.id}/stop`} label="campaign.stop" confirm="campaign.stopConfirm" tone="danger" />
          <p className="text-xs text-stone-500">{t("campaign.stopHint", { amount: `${birr(refundNow)} ${t("common.birr")}` })}</p>
        </div>
      )}
    </div>
  );
}

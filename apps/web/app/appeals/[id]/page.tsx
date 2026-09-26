import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import { decisionFor } from "@dinkuan/moderation";
import { AppealForm } from "@/components/AppealForm";
import { formatDay, formatTime } from "@/lib/format";
import { currentUser, getT } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation decision" };

/** F22-AC4/AC6: the person sees what was decided about them and why, and can appeal once. */
export default async function AppealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/appeals/${id}`);
  const { lang, t } = await getT();
  const d = await decisionFor(user.id, id).catch(() => null);
  if (!d) notFound();
  const status = d.appeal?.status;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("appeal.title")}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-2xl bg-white p-3 text-sm ring-1 ring-tent-100" data-testid="decision">
        <dt className="text-stone-500">{t("appeal.what")}</dt>
        <dd className="font-semibold">
          {t(`mod.action.${d.action}` as MessageKey)} · {t(`mod.target.${d.targetType}` as MessageKey)}
        </dd>
        <dt className="text-stone-500">{t("appeal.reason")}</dt>
        <dd>{t(`report.${d.reason}` as MessageKey)}</dd>
        <dt className="text-stone-500">{t("appeal.when")}</dt>
        <dd>
          {formatDay(d.createdAt, lang)} {formatTime(d.createdAt, lang)}
        </dd>
      </dl>
      {status === "open" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="appeal-status">{t("appeal.open")}</p>}
      {status === "upheld" && <p className="rounded-xl bg-stone-100 p-3 text-sm" data-testid="appeal-status">{t("appeal.upheld")}</p>}
      {status === "overturned" && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="appeal-status">{t("appeal.overturned")}</p>}
      {d.canAppeal && <AppealForm lang={lang} actionId={d.id} />}
      <Link href="/guidelines" className="block text-sm font-semibold text-tent-700">
        {t("appeal.guidelines")}
      </Link>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import { appealQueue } from "@dinkuan/moderation";
import { ActionButton } from "@/components/ActionButton";
import { formatDay } from "@/lib/format";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Appeals" };

/** F22-AC6: open appeals. The moderator who made the decision can't decide its appeal. */
export default async function AppealsPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/moderation/appeals");
  if (!isAdmin(user)) notFound();
  const { lang, t } = await getT();
  const appeals = await appealQueue();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("mod.appeals")}</h1>
      {appeals.length === 0 && <p className="text-stone-500">{t("mod.appealsEmpty")}</p>}
      <ul className="space-y-3">
        {appeals.map((a) => (
          <li key={a.id} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="appeal-item">
            <p className="text-sm font-bold">
              {t("mod.appealBy", { username: a.user.profile?.username ?? "?" })} · {formatDay(a.createdAt, lang)}
            </p>
            <p className="text-xs text-stone-600">
              {t(`mod.target.${a.action.targetType}` as MessageKey)} ·{" "}
              {t("mod.decision", {
                action: t(`mod.action.${a.action.action}` as MessageKey),
                reason: t(`report.${a.action.reason}` as MessageKey),
              })}
            </p>
            <p className="whitespace-pre-wrap rounded-xl bg-stone-50 p-2 text-sm">{a.text}</p>
            {a.action.moderatorId !== user.id && (
              <div className="flex gap-2">
                <ActionButton lang={lang} url={`/api/admin/appeals/${a.id}`} body={{ overturn: true }} label="mod.overturn" />
                <ActionButton lang={lang} url={`/api/admin/appeals/${a.id}`} body={{ overturn: false }} label="mod.uphold" tone="quiet" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

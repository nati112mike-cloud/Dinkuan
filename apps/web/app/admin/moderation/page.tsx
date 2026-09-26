import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { MessageKey } from "@dinkuan/i18n";
import { moderationQueue, type QueueItem } from "@dinkuan/moderation";
import { ActionButton } from "@/components/ActionButton";
import { formatDay, formatTime } from "@/lib/format";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation" };

const SEVERITY_TONE: Record<number, string> = {
  4: "bg-rose-600 text-white",
  3: "bg-rose-100 text-rose-800",
  2: "bg-amber-100 text-amber-900",
  1: "bg-stone-100 text-stone-700",
};

/** F22-AC4/AC7: reported and screened content, most severe and most reported first. */
export default async function ModerationPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/moderation");
  if (!isAdmin(user)) notFound();
  const { lang, t } = await getT();
  const queue = await moderationQueue();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{t("mod.title")}</h1>
        <Link href="/admin/moderation/appeals" className="tap flex items-center rounded-xl bg-white px-3 text-sm font-semibold ring-1 ring-tent-200">
          {t("mod.appeals")}
        </Link>
      </div>
      {queue.length === 0 && <p className="text-stone-500">{t("mod.empty")}</p>}
      <ul className="space-y-3">
        {queue.map((item) => (
          <QueueCard key={`${item.targetType}:${item.targetId}`} item={item} lang={lang} t={t} self={user.id} />
        ))}
      </ul>
    </div>
  );
}

function QueueCard({ item, lang, t, self }: { item: QueueItem; lang: "am" | "en"; t: (k: MessageKey, v?: Record<string, string | number>) => string; self: string }) {
  const reason = item.reasons[0]?.reason ?? "other";
  const body = { targetType: item.targetType, targetId: item.targetId, reason };
  const url = "/api/admin/moderation";
  const s = item.subject;
  return (
    <li className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="mod-item">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
        <span className={`rounded-full px-2 py-0.5 ${SEVERITY_TONE[item.severity] ?? SEVERITY_TONE[1]}`}>{t(`mod.severity${item.severity}` as MessageKey)}</span>
        <span className="rounded-full bg-tent-50 px-2 py-0.5">{t(`mod.target.${item.targetType}` as MessageKey)}</span>
        <span className="text-stone-600">{t("mod.reports", { n: item.reports })}</span>
        {item.automated && <span className="text-stone-600">· {t("mod.automated")}</span>}
        <span className={item.overdue ? "text-rose-700" : "text-stone-500"}>
          · {item.overdue ? t("mod.overdue") : t("mod.due", { time: `${formatDay(item.dueAt, lang)} ${formatTime(item.dueAt, lang)}` })}
        </span>
      </div>
      <p className="flex flex-wrap gap-1 text-xs">
        {item.reasons.map((r) => (
          <span key={r.reason} className="rounded-full bg-stone-100 px-2 py-0.5">
            {t(`report.${r.reason}` as MessageKey)} × {r.count}
          </span>
        ))}
      </p>
      {item.preview.text && <p className="whitespace-pre-wrap break-words rounded-xl bg-stone-50 p-2 text-sm" data-testid="mod-preview">{item.preview.text}</p>}
      {item.preview.images.length > 0 && (
        <div className="flex gap-2">
          {item.preview.images.map((src) => (
            <img key={src} src={src} alt="" className="h-16 w-16 rounded-lg object-cover blur-sm hover:blur-none" />
          ))}
        </div>
      )}
      {item.details.map((d, i) => (
        <p key={i} className="text-xs italic text-stone-600">
          “{d}”
        </p>
      ))}
      {s && (
        <p className="text-sm">
          @{s.username ?? "?"} · {t("mod.strikes", { n: s.strikes })}
          {s.state !== "active" && <span className="font-bold text-rose-700"> · {t(s.state === "banned" ? "mod.banned" : "mod.suspended")}</span>}
          {item.preview.href && (
            <Link href={item.preview.href} className="ml-2 font-semibold text-tent-700">
              {t("mod.open")}
            </Link>
          )}
        </p>
      )}
      {s?.id !== self && (
        <div className="flex flex-wrap gap-2">
          <ActionButton lang={lang} url={url} body={{ ...body, action: "remove" }} label="mod.remove" tone="danger" />
          {item.targetType === "post" && <ActionButton lang={lang} url={url} body={{ ...body, action: "age_restrict" }} label="mod.ageRestrict" tone="quiet" />}
          <ActionButton lang={lang} url={url} body={{ ...body, action: "warn" }} label="mod.warn" tone="quiet" />
          <ActionButton lang={lang} url={url} body={{ ...body, action: "suspend" }} label="mod.suspend" tone="quiet" />
          <ActionButton lang={lang} url={url} body={{ ...body, action: "ban" }} label="mod.ban" confirm="mod.banConfirm" tone="danger" />
          <ActionButton lang={lang} url={url} body={{ ...body, action: "dismiss" }} label="mod.dismiss" tone="quiet" />
        </div>
      )}
    </li>
  );
}

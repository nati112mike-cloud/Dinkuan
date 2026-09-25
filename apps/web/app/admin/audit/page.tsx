import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auditLog } from "@dinkuan/core/server";
import { currentUser, getT, isAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit log" };

const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", dateStyle: "short", timeStyle: "short" });

/** F12-AC4: every admin action and money change, newest first. Read-only. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; before?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin/audit");
  if (!isAdmin(user)) notFound();
  const { t } = await getT();
  const sp = await searchParams;
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : undefined;
  const rows = await auditLog({ entity: sp.entity || undefined, before, take: 50 });
  const last = rows.at(-1);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("admin.audit")}</h1>
      <nav className="flex flex-wrap gap-2 text-xs font-semibold">
        {["", "organiser", "event", "order", "campaign"].map((e) => (
          <Link key={e} href={e ? `/admin/audit?entity=${e}` : "/admin/audit"} className={`rounded-full px-3 py-1 ring-1 ${(sp.entity ?? "") === e ? "bg-tent-600 text-white ring-tent-600" : "ring-tent-200"}`}>
            {e || t("admin.all")}
          </Link>
        ))}
      </nav>
      <ul className="divide-y divide-tent-100 rounded-2xl bg-white text-sm ring-1 ring-tent-100">
        {rows.map((r) => (
          <li key={r.id} className="space-y-0.5 p-2">
            <div className="flex justify-between gap-2">
              <span className="font-mono font-semibold">{r.action}</span>
              <span className="shrink-0 text-xs text-stone-500">{fmt.format(r.createdAt)}</span>
            </div>
            <div className="truncate text-xs text-stone-500">
              {r.entity} {r.entityId.slice(0, 8)} · {r.actorUserId ? r.actorUserId.slice(0, 8) : "system"}
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="p-3 text-stone-500">{t("admin.nothing")}</li>}
      </ul>
      {last && rows.length === 50 && (
        <Link href={`/admin/audit?${new URLSearchParams({ ...(sp.entity ? { entity: sp.entity } : {}), before: last.createdAt.toISOString() })}`} className="block text-center text-sm font-semibold text-tent-700">
          {t("admin.older")}
        </Link>
      )}
    </div>
  );
}

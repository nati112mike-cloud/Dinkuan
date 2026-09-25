"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

export type TeamRow = { userId: string; name: string; phone: string; role: "manager" | "scanner" };

/** F2-AC5: the owner adds managers and scanners by phone; managers can add scanners only. */
export function TeamForm({ lang, organiserId, team, canAddManager }: { lang: Lang; organiserId: string; team: TeamRow[]; canAddManager: boolean }) {
  const t = translator(lang);
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "scanner">("scanner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = "tap rounded-xl border border-tent-200 bg-white px-3";
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {team.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-tent-100">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{m.name || m.phone}</span>
              <span className="block text-xs text-stone-500">{t(m.role === "manager" ? "team.manager" : "team.scanner")}</span>
            </span>
            <button
              type="button"
              className="tap rounded-xl px-3 text-sm font-bold text-rose-700 ring-1 ring-rose-200"
              onClick={async () => {
                if (!window.confirm(t("team.removeConfirm"))) return;
                const r = await api(`/api/organiser/team/${m.userId}?organiser=${organiserId}`, { method: "DELETE" });
                if (r.ok) router.refresh();
                else setError(errorText(lang, r.code));
              }}
            >
              {t("team.remove")}
            </button>
          </li>
        ))}
        {team.length === 0 && <li className="text-sm text-stone-500">{t("team.empty")}</li>}
      </ul>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const r = await api("/api/organiser/team", { body: { organiserId, phone, role } });
          setBusy(false);
          if (r.ok) {
            setPhone("");
            router.refresh();
          } else setError(errorText(lang, r.code));
        }}
      >
        <input required type="tel" inputMode="tel" placeholder="09…" aria-label={t("team.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} className={`${field} w-full`} />
        <div className="flex gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value as "manager" | "scanner")} className={`${field} flex-1`} aria-label={t("team.role")}>
            <option value="scanner">{t("team.scanner")}</option>
            {canAddManager && <option value="manager">{t("team.manager")}</option>}
          </select>
          <button type="submit" disabled={busy} className="tap flex-1 rounded-xl bg-tent-700 font-bold text-white disabled:opacity-50">
            {t("team.add")}
          </button>
        </div>
        {error && <p className="text-sm text-rose-700">{error}</p>}
      </form>
    </div>
  );
}

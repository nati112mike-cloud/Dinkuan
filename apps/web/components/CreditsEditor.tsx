"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

type Credit = { id: string; name: string; verified: boolean };

/** F20-AC3: venues and events you've worked. Credits from confirmed gigs are verified. */
export function CreditsEditor({ lang, initial }: { lang: Lang; initial: Credit[] }) {
  const t = translator(lang);
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {list.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-tent-100">
            <span>
              🎪 {c.name} {c.verified && <span className="text-xs font-bold text-emerald-700">✓ {t("vendor.verified")}</span>}
            </span>
            <button
              type="button"
              aria-label={t("post.delete")}
              onClick={async () => {
                const r = await api(`/api/vendor/credits/${c.id}`, { method: "DELETE" });
                if (r.ok) setList((l) => l.filter((x) => x.id !== c.id));
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const r = await api<Credit>("/api/vendor/credits", { body: { name } });
          if (r.ok) {
            setList((l) => [...l, r.data]);
            setName("");
          } else setError(errorText(lang, r.code));
        }}
      >
        <input required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("portfolio.creditPlaceholder")} aria-label={t("vendor.stages")} className="tap min-w-0 flex-1 rounded-xl border border-tent-200 bg-white px-3" />
        <button className="tap rounded-xl bg-tent-600 px-4 font-bold text-white">{t("portfolio.add")}</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

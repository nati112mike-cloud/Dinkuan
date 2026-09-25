"use client";

import { useEffect, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api } from "@/lib/client";
import { PeopleList, type PersonRow } from "./PeopleList";

/** F17-AC4: search people by name or @username, Amharic or English. */
export function PeopleSearch({ lang, viewerId, children }: { lang: Lang; viewerId: string | null; children: React.ReactNode }) {
  const t = translator(lang);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonRow[] | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (!term) return setResults(null);
    const id = setTimeout(async () => {
      const r = await api<PersonRow[]>(`/api/people?q=${encodeURIComponent(term)}`);
      if (r.ok) setResults(r.data);
    }, 250);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        placeholder={t("people.search")}
        aria-label={t("people.search")}
        className="tap w-full rounded-2xl border border-tent-200 bg-white px-4 py-3 shadow-sm outline-none focus:border-tent-500"
      />
      {results ? <PeopleList lang={lang} people={results} viewerId={viewerId} /> : children}
    </div>
  );
}

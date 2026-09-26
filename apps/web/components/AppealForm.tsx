"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

/** F22-AC6: one appeal per decision. */
export function AppealForm({ lang, actionId }: { lang: Lang; actionId: string }) {
  const t = translator(lang);
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const r = await api("/api/appeals", { body: { actionId, text } });
        setBusy(false);
        if (r.ok) router.refresh();
        else setError(errorText(lang, r.code));
      }}
    >
      <p className="text-sm text-stone-700">{t("appeal.can")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        minLength={10}
        maxLength={1000}
        rows={4}
        required
        aria-label={t("appeal.placeholder")}
        placeholder={t("appeal.placeholder")}
        className="w-full rounded-xl border border-tent-200 p-3"
      />
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button disabled={busy || text.trim().length < 10} className="tap w-full rounded-2xl bg-tent-700 font-bold text-white disabled:opacity-50">
        {t("appeal.send")}
      </button>
    </form>
  );
}

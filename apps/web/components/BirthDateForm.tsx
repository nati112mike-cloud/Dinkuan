"use client";

import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";

/** F22-AC8: members who joined before birth dates were asked add one, once. */
export function BirthDateForm({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ birthDate: value }) });
        setBusy(false);
        if (res.ok) return window.location.reload();
        const json = await res.json().catch(() => null);
        if (json?.error?.code === "UNDERAGE") return (window.location.href = "/login");
        const key = `error.${json?.error?.code}` as MessageKey;
        setError(t(key) === key ? t("error.generic") : t(key));
      }}
    >
      <label className="block space-y-1 text-sm font-semibold">
        {t("age.birthDate")}
        <input type="date" required value={value} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setValue(e.target.value)} className="tap w-full rounded-xl border border-tent-200 bg-white px-3" />
      </label>
      <p className="text-xs text-stone-500">{t("age.birthDateHint")}</p>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button disabled={busy || !value} className="tap w-full rounded-xl bg-tent-600 px-4 font-semibold text-white disabled:opacity-50">
        {t("age.save")}
      </button>
    </form>
  );
}

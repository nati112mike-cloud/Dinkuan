"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";

export function NameForm({ lang, initial }: { lang: Lang; initial: string }) {
  const t = translator(lang);
  const [name, setName] = useState(initial);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
        setSaved(res.ok);
      }}
    >
      <label className="flex-1 space-y-1 text-sm font-semibold">
        {t("login.name")}
        <input value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} className="tap w-full rounded-xl border border-tent-200 px-3" />
      </label>
      <button disabled={!name.trim()} className="tap rounded-xl bg-tent-600 px-4 font-semibold text-white disabled:opacity-50">
        {saved ? "✓" : t("login.saveName")}
      </button>
    </form>
  );
}

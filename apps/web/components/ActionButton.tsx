"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

/** A button that POSTs to an API route and refreshes the page on success. */
export function ActionButton({
  lang,
  url,
  body = {},
  label,
  confirm,
  prompt,
  tone = "primary",
}: {
  lang: Lang;
  url: string;
  body?: unknown;
  label: MessageKey;
  confirm?: MessageKey;
  /** Ask for a short text (a reason or note) and send it as this body field. */
  prompt?: { field: string; label: MessageKey };
  tone?: "primary" | "quiet" | "danger";
}) {
  const t = translator(lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const style =
    tone === "primary"
      ? "bg-tent-700 text-white"
      : tone === "danger"
        ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
        : "bg-white text-stone-700 ring-1 ring-tent-200";
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className={`tap rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${style}`}
        onClick={async () => {
          if (confirm && !window.confirm(t(confirm))) return;
          let payload = body;
          if (prompt) {
            const text = window.prompt(t(prompt.label))?.trim();
            if (!text) return;
            payload = { ...(body as object), [prompt.field]: text };
          }
          setBusy(true);
          setError(null);
          const r = await api(url, { body: payload });
          setBusy(false);
          if (r.ok) router.refresh();
          else setError(errorText(lang, r.code));
        }}
      >
        {t(label)}
      </button>
      {error && <span className="mt-1 text-xs text-rose-700">{error}</span>}
    </span>
  );
}

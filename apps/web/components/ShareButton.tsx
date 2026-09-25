"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";

export function ShareButton({ lang, title }: { lang: Lang; title: string }) {
  const t = translator(lang);
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="tap rounded-full bg-white px-4 text-sm font-semibold ring-1 ring-tent-200"
      onClick={async () => {
        const url = window.location.href.split("?")[0]!;
        if (navigator.share) {
          await navigator.share({ title, url }).catch(() => undefined);
        } else {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      }}
    >
      ↗ {copied ? t("event.copied") : t("event.share")}
    </button>
  );
}

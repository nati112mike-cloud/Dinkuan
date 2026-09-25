"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@dinkuan/i18n";

export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next: Lang = lang === "am" ? "en" : "am";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await fetch("/api/me", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: next }) });
          router.refresh();
        })
      }
      className="tap rounded-full border border-tent-200 px-3 text-sm font-semibold text-tent-700"
      aria-label="Change language"
    >
      {next === "en" ? "EN" : "አማ"}
    </button>
  );
}

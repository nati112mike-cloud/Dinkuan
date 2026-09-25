"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";

export function SaveButton({ lang, eventId, initial, loggedIn }: { lang: Lang; eventId: string; initial: boolean; loggedIn: boolean }) {
  const t = translator(lang);
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  return (
    <button
      type="button"
      aria-pressed={saved}
      className={`tap rounded-full px-4 text-sm font-semibold ring-1 ${saved ? "bg-tent-600 text-white ring-tent-600" : "bg-white ring-tent-200"}`}
      onClick={async () => {
        if (!loggedIn) return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        setSaved(!saved);
        const res = await fetch(`/api/events/${eventId}/save`, { method: "POST" });
        if (res.ok) setSaved((await res.json()).data.saved);
      }}
    >
      {saved ? `♥ ${t("event.saved")}` : `♡ ${t("event.save")}`}
    </button>
  );
}

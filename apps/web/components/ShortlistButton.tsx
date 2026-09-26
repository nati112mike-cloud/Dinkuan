"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, loginUrl } from "@/lib/client";

/** F20-AC13: save a vendor to your shortlist. */
export function ShortlistButton({
  lang,
  vendorId,
  initial,
  loggedIn,
  big = false,
}: {
  lang: Lang;
  vendorId: string;
  initial: boolean;
  loggedIn: boolean;
  big?: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const toggle = async () => {
    if (!loggedIn) return router.push(loginUrl());
    setSaved((s) => !s);
    const r = await api<{ saved: boolean }>("/api/shortlist", { body: { vendorId } });
    if (r.ok) setSaved(r.data.saved);
    else setSaved(initial);
  };
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={saved}
      className={
        big
          ? `tap grid place-items-center rounded-full px-4 font-semibold ring-1 ${saved ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-white ring-tent-200"}`
          : `tap flex-1 text-sm font-semibold ${saved ? "text-rose-600" : "text-stone-600"}`
      }
    >
      {saved ? "♥" : "♡"} {saved ? t("hire.shortlisted") : t("hire.shortlist")}
    </button>
  );
}

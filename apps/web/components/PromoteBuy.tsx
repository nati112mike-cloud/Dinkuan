"use client";

import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { api, errorText } from "@/lib/client";

/** F21-AC3: pay for a promotion package through the gateway. */
export function PromoteBuy({
  lang,
  packageKey,
  targetType,
  targetId,
}: {
  lang: Lang;
  packageKey: string;
  targetType: string;
  targetId: string;
}) {
  const t = translator(lang);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="tap w-full rounded-2xl bg-tent-700 px-4 font-bold text-white disabled:opacity-50"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await api<{ checkoutUrl: string }>("/api/promotions", {
            body: { packageKey, targetType, targetId, gateway: "telebirr" },
          });
          if (r.ok) window.location.href = r.data.checkoutUrl;
          else {
            setBusy(false);
            setError(errorText(lang, r.code));
          }
        }}
      >
        {t("promote.buy")}
      </button>
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}
    </div>
  );
}

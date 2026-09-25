"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";

export function OrderStatus({
  lang,
  orderId,
  initial,
  number,
  eventSlug,
  needsName,
}: {
  lang: Lang;
  orderId: string;
  initial: string;
  number: number;
  eventSlug: string;
  needsName: boolean;
}) {
  const t = translator(lang);
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    if (status !== "pending") return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) setStatus((await res.json()).data.status);
    }, 2000);
    return () => clearInterval(timer);
  }, [orderId, status]);

  return (
    <div className="space-y-5 py-8 text-center">
      <p className="text-sm text-stone-500">{t("order.number", { number })}</p>
      {status === "pending" && (
        <>
          <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-tent-200 border-t-tent-600" />
          <h1 className="text-xl font-bold">{t("order.pending")}</h1>
          <p className="text-stone-500">{t("order.pendingHint")}</p>
        </>
      )}
      {status === "paid" && (
        <>
          <div className="text-6xl" aria-hidden>
            🎉
          </div>
          <h1 className="text-3xl font-extrabold">{t("order.paid")}</h1>
          <p className="text-stone-600">{t("order.paidHint")}</p>
          <Link href={needsName ? "/profile?welcome=1" : "/tickets"} className="tap mx-auto grid max-w-xs place-items-center rounded-2xl bg-tent-600 py-3 font-bold text-white">
            {t("order.viewTickets")}
          </Link>
        </>
      )}
      {(status === "expired" || status === "failed") && (
        <>
          <h1 className="text-xl font-bold">{status === "expired" ? t("order.expired") : t("order.failed")}</h1>
          <Link href={`/e/${eventSlug}`} className="tap mx-auto grid max-w-xs place-items-center rounded-2xl bg-tent-600 py-3 font-bold text-white">
            {t("order.tryAgain")}
          </Link>
        </>
      )}
      {(status === "refunded" || status === "refund_pending") && <h1 className="text-xl font-bold">{t("order.refunded")}</h1>}
    </div>
  );
}

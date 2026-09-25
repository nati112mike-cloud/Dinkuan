"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBirr } from "@dinkuan/core";
import { translator, type Lang } from "@dinkuan/i18n";

export interface SelectorType {
  id: string;
  name: string;
  price: number;
  allIn: number;
  fee: number;
  left: number;
  max: number;
  soldOut: boolean;
  closed: boolean;
}

export function TicketSelector({
  lang,
  slug,
  types,
  loggedIn,
}: {
  lang: Lang;
  eventId: string;
  slug: string;
  types: SelectorType[];
  loggedIn: boolean;
}) {
  const t = translator(lang);
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const total = types.reduce((a, tt) => a + tt.allIn * (qty[tt.id] ?? 0), 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);

  function go() {
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => `${id}:${q}`)
      .join(",");
    const next = `/checkout?event=${slug}&items=${items}`;
    router.push(loggedIn ? next : `/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-tent-100 overflow-hidden rounded-2xl bg-white ring-1 ring-tent-100">
        {types.map((tt) => {
          const q = qty[tt.id] ?? 0;
          const unavailable = tt.soldOut || tt.closed;
          return (
            <li key={tt.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{tt.name}</p>
                <p className="text-sm">
                  {tt.price === 0 ? (
                    t("event.free")
                  ) : (
                    <>
                      <span className="font-bold">{t("event.allIn", { price: formatBirr(tt.allIn) })}</span>{" "}
                      <span className="text-stone-500">({t("event.feeIncluded", { fee: formatBirr(tt.fee) })})</span>
                    </>
                  )}
                </p>
                {!unavailable && tt.left <= 20 && <p className="text-xs font-semibold text-tent-600">{t("event.left", { count: tt.left })}</p>}
              </div>
              {unavailable ? (
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-500">
                  {tt.soldOut ? t("event.soldOut") : t("error.SALES_CLOSED")}
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="−"
                    disabled={q === 0}
                    onClick={() => setQty({ ...qty, [tt.id]: q - 1 })}
                    className="tap rounded-full bg-tent-100 text-xl font-bold text-tent-700 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-bold" data-testid={`qty-${tt.name}`}>
                    {q}
                  </span>
                  <button
                    type="button"
                    aria-label="+"
                    disabled={q >= tt.max}
                    onClick={() => setQty({ ...qty, [tt.id]: q + 1 })}
                    className="tap rounded-full bg-tent-600 text-xl font-bold text-white disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={count === 0}
        onClick={go}
        className="tap sticky bottom-20 w-full rounded-2xl bg-tent-600 py-3 text-lg font-bold text-white shadow-lg disabled:bg-stone-300"
      >
        {count === 0 ? t("event.selectTickets") : `${t("event.continue")} · ${t("money.birr", { amount: formatBirr(total) })}`}
      </button>
    </div>
  );
}

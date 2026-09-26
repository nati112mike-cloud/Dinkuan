"use client";

import { useState } from "react";
import { formatBirr } from "@dinkuan/core";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";

export function CheckoutForm({
  lang,
  eventId,
  items,
  total,
  accessCode,
}: {
  lang: Lang;
  eventId: string;
  items: { ticketTypeId: string; qty: number }[];
  total: number;
  accessCode?: string | null;
}) {
  const t = translator(lang);
  const [gateway, setGateway] = useState<"telebirr" | "chapa">("telebirr");
  const [sharePhone, setSharePhone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, items, gateway, sharePhone, accessCode: accessCode ?? null }),
    });
    const json = await res.json();
    if (!res.ok) {
      const key = `error.${json.error?.code}` as MessageKey;
      setError(t(key) === key ? t("error.generic") : t(key));
      setBusy(false);
      return;
    }
    window.location.href = json.data.checkoutUrl;
  }

  const methods = [
    { id: "telebirr" as const, label: t("checkout.telebirr"), badge: "bg-sky-600" },
    { id: "chapa" as const, label: t("checkout.chapa"), badge: "bg-emerald-600" },
  ];
  return (
    <div className="space-y-3">
      {total > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 font-bold">{t("checkout.method")}</legend>
          {methods.map((m) => (
            <label
              key={m.id}
              className={`tap flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-4 ring-2 ${gateway === m.id ? "ring-tent-500" : "ring-tent-100"}`}
            >
              <input type="radio" name="gateway" value={m.id} checked={gateway === m.id} onChange={() => setGateway(m.id)} className="h-5 w-5 accent-tent-600" />
              <span className={`h-3 w-3 rounded-full ${m.badge}`} aria-hidden />
              <span className="font-semibold">{m.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex items-start gap-3 rounded-2xl bg-white p-3 text-sm ring-1 ring-tent-100">
        <input type="checkbox" checked={sharePhone} onChange={(e) => setSharePhone(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-tent-600" />
        <span>{t("checkout.sharePhone")}</span>
      </label>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="tap w-full rounded-2xl bg-tent-600 py-3 text-lg font-bold text-white shadow-lg disabled:opacity-60"
      >
        {busy ? "…" : total === 0 ? t("event.continue") : t("checkout.pay", { total: formatBirr(total) })}
      </button>
    </div>
  );
}

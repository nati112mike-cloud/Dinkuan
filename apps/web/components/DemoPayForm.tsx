"use client";

import { useState } from "react";
import { formatBirr } from "@dinkuan/core";

/**
 * Demo gateway screen. This is a simulation of a third-party page, so it is intentionally
 * English-only and outside the app's i18n (like a real gateway page would be).
 */
export function DemoPayForm(props: {
  refId: string;
  returnUrl: string;
  gateway: "telebirr" | "chapa";
  amountSantim: number;
  description: string;
  status: string;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const name = props.gateway === "telebirr" ? "Telebirr" : "Chapa";

  async function act(action: "confirm" | "cancel") {
    setBusy(true);
    await fetch(`/api/demo-pay/${encodeURIComponent(props.refId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    // Like a real gateway, send the buyer back to the merchant's return URL.
    window.location.href = props.returnUrl;
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-3xl bg-white p-6 shadow-lg ring-1 ring-stone-200">
      <div className="rounded-xl bg-amber-100 px-3 py-2 text-center text-xs font-bold uppercase tracking-wide text-amber-900">
        Simulated payment · no real money
      </div>
      <div className="text-center">
        <p className="text-sm text-stone-500">{name} (demo)</p>
        <p className="text-4xl font-extrabold">{formatBirr(props.amountSantim)} ETB</p>
        <p className="mt-1 text-sm text-stone-500">To: Dinkuan · {props.description}</p>
      </div>
      {props.status !== "pending" ? (
        <p className="text-center font-semibold">This payment was already {props.status}.</p>
      ) : (
        <>
          <label className="block space-y-1 text-sm font-semibold">
            Enter any PIN to approve
            <input
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="tap w-full rounded-xl border border-stone-300 px-4 text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
            />
          </label>
          <button
            type="button"
            disabled={busy || pin.length < 4}
            onClick={() => act("confirm")}
            className="tap w-full rounded-2xl bg-sky-700 py-3 text-lg font-bold text-white disabled:opacity-40"
          >
            Approve payment
          </button>
          <button type="button" disabled={busy} onClick={() => act("cancel")} className="tap w-full rounded-2xl py-2 font-semibold text-stone-500">
            Cancel
          </button>
        </>
      )}
    </div>
  );
}

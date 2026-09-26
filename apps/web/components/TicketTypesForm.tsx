"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { fromAddisInput } from "@/lib/addis-time";
import { api, errorText } from "@/lib/client";

export type TicketRow = {
  id: string | null;
  name: string;
  priceBirr: string;
  capacity: string;
  salesStart: string;
  salesEnd: string;
  perOrderMax: string;
  hidden: boolean;
  accessCode: string;
  sold: number;
};

const blank = (name: string, priceBirr: string, capacity: string): TicketRow => ({
  id: null,
  name,
  priceBirr,
  capacity,
  salesStart: "",
  salesEnd: "",
  perOrderMax: "10",
  hidden: false,
  accessCode: "",
  sold: 0,
});

/** Birr as typed ("350" or "350.50") to integer santim, without floating point. */
function toSantim(birr: string) {
  const m = birr.trim().match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
  if (!m) return NaN;
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}

/** F3 wizard step 2 (AC3/AC4/AC6): ticket types with price, capacity, sales window and limits. */
export function TicketTypesForm({ lang, eventId, initial, canSellPaid }: { lang: Lang; eventId: string; initial: TicketRow[]; canSellPaid: boolean }) {
  const t = translator(lang);
  const router = useRouter();
  const [rows, setRows] = useState<TicketRow[]>(initial.length ? initial : [blank(t("tickets.regular"), canSellPaid ? "300" : "0", "200")]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, patch: Partial<TicketRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const out = [...rs];
      [out[i], out[j]] = [out[j]!, out[i]!];
      return out;
    });
  const field = "tap w-full rounded-xl border border-tent-200 bg-white px-3";
  const label = "block space-y-1 text-xs font-semibold";

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const types = rows.map((r) => ({
          id: r.id,
          name: r.name,
          priceSantim: toSantim(r.priceBirr || "0"),
          capacity: Number(r.capacity),
          salesStart: fromAddisInput(r.salesStart),
          salesEnd: fromAddisInput(r.salesEnd),
          perOrderMax: Number(r.perOrderMax) || 10,
          visibility: r.hidden ? "hidden" : "public",
          accessCode: r.hidden ? r.accessCode : null,
        }));
        if (types.some((x) => Number.isNaN(x.priceSantim))) {
          setError(t("tickets.badPrice"));
          return;
        }
        setBusy(true);
        const r = await api(`/api/organiser/events/${eventId}/tickets`, { method: "PUT", body: { types } });
        setBusy(false);
        if (r.ok) {
          router.push(`/organiser/events/${eventId}`);
          router.refresh();
        } else setError(errorText(lang, r.code));
      }}
    >
      {!canSellPaid && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("tickets.freeOnly")}</p>}
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-tent-100" data-testid="ticket-row">
            <div className="flex items-center gap-2">
              <input required maxLength={40} aria-label={t("tickets.name")} value={r.name} onChange={(e) => update(i, { name: e.target.value })} className={`${field} font-bold`} />
              <button type="button" aria-label={t("tickets.up")} onClick={() => move(i, -1)} className="tap rounded-lg px-2 ring-1 ring-tent-200">
                ↑
              </button>
              <button type="button" aria-label={t("tickets.down")} onClick={() => move(i, 1)} className="tap rounded-lg px-2 ring-1 ring-tent-200">
                ↓
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className={label}>
                {t("tickets.price")}
                <input
                  inputMode="decimal"
                  required
                  value={r.priceBirr}
                  disabled={r.sold > 0}
                  onChange={(e) => update(i, { priceBirr: e.target.value })}
                  className={field}
                  data-testid="ticket-price"
                />
              </label>
              <label className={label}>
                {t("tickets.capacity")}
                <input type="number" min={Math.max(1, r.sold)} required value={r.capacity} onChange={(e) => update(i, { capacity: e.target.value })} className={field} data-testid="ticket-capacity" />
              </label>
              <label className={label}>
                {t("tickets.salesStart")}
                <input type="datetime-local" value={r.salesStart} onChange={(e) => update(i, { salesStart: e.target.value })} className={field} />
              </label>
              <label className={label}>
                {t("tickets.salesEnd")}
                <input type="datetime-local" value={r.salesEnd} onChange={(e) => update(i, { salesEnd: e.target.value })} className={field} />
              </label>
              <label className={label}>
                {t("tickets.perOrder")}
                <input type="number" min={1} max={20} value={r.perOrderMax} onChange={(e) => update(i, { perOrderMax: e.target.value })} className={field} />
              </label>
              <label className="flex items-end gap-2 pb-3 text-xs font-semibold">
                <input type="checkbox" checked={r.hidden} onChange={(e) => update(i, { hidden: e.target.checked })} />
                {t("tickets.hidden")}
              </label>
            </div>
            {r.hidden && (
              <input required minLength={3} maxLength={20} aria-label={t("tickets.code")} placeholder={t("tickets.code")} value={r.accessCode} onChange={(e) => update(i, { accessCode: e.target.value })} className={field} />
            )}
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>{r.sold > 0 ? t("tickets.soldLocked", { n: r.sold }) : ""}</span>
              {r.sold === 0 && rows.length > 1 && (
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="font-semibold text-rose-700">
                  {t("tickets.remove")}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {rows.length < 10 && (
        <button type="button" onClick={() => setRows((rs) => [...rs, blank("", canSellPaid ? "" : "0", "100")])} className="tap w-full rounded-xl bg-white font-bold ring-1 ring-tent-200">
          + {t("tickets.add")}
        </button>
      )}
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button type="submit" disabled={busy} className="tap w-full rounded-xl bg-tent-700 font-bold text-white disabled:opacity-50">
        {busy ? t("organiser.saving") : t("tickets.saveNext")}
      </button>
    </form>
  );
}

import QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanResult } from "@dinkuan/core";
import { counts, manualAdmit, searchTickets, sync, verifyAtGate } from "../gate";
import { db, type StoredPack, type StoredTicket } from "../db";
import { tr, type Lang, type ScannerKey } from "../i18n";

type Shown = { ok: true; name: string; type: string } | { ok: false; reason: string; name?: string; usedAt?: string };

export function Gate({ lang, eventId, onChangeEvent }: { lang: Lang; eventId: string; onChangeEvent: () => void }) {
  const t = tr(lang);
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const [pack, setPack] = useState<StoredPack | null>(null);
  const [gate, setGate] = useState(() => localStorage.getItem("dk_scanner_gate") ?? "A");
  const [shown, setShown] = useState<Shown | null>(null);
  const [stats, setStats] = useState({ checkedIn: 0, total: 0, pending: 0 });
  const [online, setOnline] = useState(navigator.onLine);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<"scan" | "search">("scan");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<StoredTicket[]>([]);
  const [paste, setPaste] = useState("");
  const [cameraError, setCameraError] = useState(false);

  const refresh = useCallback(() => counts(eventId).then(setStats), [eventId]);

  useEffect(() => {
    db.packs.get(eventId).then((p) => setPack(p ?? null));
    refresh();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [eventId, refresh]);

  useEffect(() => localStorage.setItem("dk_scanner_gate", gate), [gate]);

  const doSync = useCallback(async () => {
    setNote(t("syncing"));
    try {
      const r = await sync(eventId);
      setNote([t("synced", { pushed: r.pushed }), r.conflicts ? t("conflicts", { count: r.conflicts }) : ""].filter(Boolean).join(" · "));
    } catch {
      setNote(t("offline"));
    }
    refresh();
  }, [eventId, refresh, t]);

  // Background sync every 30 s while online (F8-AC4).
  useEffect(() => {
    if (!online) return;
    const id = setInterval(() => {
      db.checkIns.where("[eventId+synced]").equals([eventId, 0]).count().then((n) => {
        if (n) void doSync();
      });
    }, 30_000);
    return () => clearInterval(id);
  }, [online, eventId, doSync]);

  const show = useCallback(
    (r: ScanResult) => {
      if (r.valid) setShown({ ok: true, name: r.ticket.holderName, type: r.ticket.typeName });
      else setShown({ ok: false, reason: r.reason, name: r.ticket?.holderName, usedAt: "usedAt" in r ? r.usedAt : undefined });
      if ("vibrate" in navigator) navigator.vibrate(r.valid ? 80 : [60, 60, 60]);
      refresh();
      setTimeout(() => setShown(null), 2200);
    },
    [refresh],
  );

  const handle = useCallback(
    async (payload: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        show(await verifyAtGate(payload, { eventId, gate }));
      } finally {
        setTimeout(() => (busy.current = false), 1500);
      }
    },
    [eventId, gate, show],
  );

  useEffect(() => {
    if (mode !== "scan" || !video.current) return;
    const scanner = new QrScanner(video.current, (res) => handle(res.data), {
      preferredCamera: "environment",
      highlightScanRegion: true,
      maxScansPerSecond: 8,
    });
    scanner.start().catch(() => setCameraError(true));
    return () => scanner.destroy();
  }, [mode, handle]);

  const fmtTime = (iso?: string) =>
    iso ? new Intl.DateTimeFormat(lang === "am" ? "am-ET" : "en-GB", { timeZone: "Africa/Addis_Ababa", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "";

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{pack ? ((lang === "am" ? pack.titleAm : pack.title) ?? pack.title) : ""}</p>
          <button className="text-xs text-white/60 underline" onClick={onChangeEvent}>
            {t("changeEvent")}
          </button>
        </div>
        <label className="flex items-center gap-1 text-sm">
          {t("gate")}
          <input value={gate} onChange={(e) => setGate(e.target.value.slice(0, 10) || "A")} className="min-h-11 w-14 rounded-lg bg-white/10 text-center font-bold" />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center" data-testid="counter">
        <div className="col-span-2 rounded-2xl bg-white/10 p-3">
          <p className="text-3xl font-extrabold">
            {stats.checkedIn} <span className="text-lg font-normal text-white/60">{t("of")} {stats.total}</span>
          </p>
          <p className="text-xs text-white/60">{t("checkedIn")}</p>
        </div>
        <button className="rounded-2xl bg-white/10 p-3 text-sm font-semibold" onClick={doSync}>
          ⟳ {t("sync")}
          {stats.pending > 0 && <span className="block text-xs text-amber-300">{t("pending", { count: stats.pending })}</span>}
        </button>
      </div>
      {!online && <p className="rounded-xl bg-amber-300 p-2 text-sm font-semibold text-amber-950">{t("offline")}</p>}
      {note && online && <p className="text-center text-xs text-white/70">{note}</p>}

      <div className="grid grid-cols-2 rounded-xl bg-white/10 p-1">
        {(["scan", "search"] as const).map((m) => (
          <button key={m} className={`min-h-11 rounded-lg font-semibold ${mode === m ? "bg-tent-600" : ""}`} onClick={() => setMode(m)}>
            {t(m)}
          </button>
        ))}
      </div>

      {mode === "scan" ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-2xl bg-black">
            <video ref={video} className="aspect-square w-full object-cover" muted playsInline />
          </div>
          {cameraError && <p className="text-sm text-amber-300">{t("cameraError")}</p>}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (paste.trim()) handle(paste.trim()).then(() => setPaste(""));
            }}
          >
            <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t("pasteCode")} aria-label={t("pasteCode")} className="min-h-11 flex-1 rounded-lg bg-white/10 px-3 text-sm" />
            <button className="min-h-11 rounded-lg bg-white/20 px-3 text-sm font-semibold">{t("check")}</button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={q}
            onChange={async (e) => {
              setQ(e.target.value);
              setFound(await searchTickets(eventId, e.target.value));
            }}
            placeholder={t("searchPlaceholder")}
            className="min-h-12 w-full rounded-xl bg-white px-4 text-black"
          />
          <ul className="space-y-2">
            {found.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between rounded-xl bg-white/10 p-3">
                <div>
                  <p className="font-semibold">{tk.holderName}</p>
                  <p className="text-xs text-white/60">
                    {tk.typeName} · •••• {tk.phoneLast4}
                  </p>
                </div>
                <button
                  className="min-h-11 rounded-lg bg-emerald-600 px-4 font-bold"
                  onClick={async () => {
                    const r = await manualAdmit(eventId, tk.id, gate);
                    if (r.ok) show({ valid: true, ticket: r.ticket });
                    else show({ valid: false, reason: r.reason as never, ticket: tk, usedAt: "usedAt" in r ? r.usedAt : undefined });
                  }}
                >
                  {t("admit")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown && (
        <button
          data-testid="scan-result"
          onClick={() => setShown(null)}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 p-8 text-center ${shown.ok ? "bg-emerald-600" : "bg-red-600"}`}
        >
          <span className="text-8xl" aria-hidden>
            {shown.ok ? "✓" : "✕"}
          </span>
          <span className="text-5xl font-extrabold">{shown.ok ? t("valid") : t("invalid")}</span>
          {shown.ok ? (
            <>
              <span className="text-3xl font-bold">{shown.type}</span>
              <span className="text-2xl">{shown.name}</span>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold">{t(`reason.${shown.reason}` as ScannerKey)}</span>
              {shown.usedAt && <span className="text-xl">{fmtTime(shown.usedAt)}</span>}
              {shown.name && <span className="text-xl opacity-90">{shown.name}</span>}
            </>
          )}
        </button>
      )}
    </div>
  );
}

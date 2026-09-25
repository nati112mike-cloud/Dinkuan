import { useEffect, useState } from "react";
import { api } from "../api";
import { db, type StoredPack } from "../db";
import { downloadPack } from "../gate";
import { tr, type Lang } from "../i18n";

interface ScannerEvent {
  id: string;
  title: string;
  titleAm: string | null;
  startsAt: string;
  venue: string;
}

export function EventPicker({ lang, onPick, onLogout }: { lang: Lang; onPick: (id: string) => void; onLogout: () => void }) {
  const t = tr(lang);
  const [events, setEvents] = useState<ScannerEvent[] | null>(null);
  const [packs, setPacks] = useState<StoredPack[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    db.packs.toArray().then(setPacks);
    // Offline: fall back to the packs already on the device.
    api<ScannerEvent[]>("/api/scanner/events").then(setEvents).catch(() => setEvents(null));
  }, []);

  const list: ScannerEvent[] = events ?? packs.map((p) => ({ id: p.eventId, title: p.title, titleAm: p.titleAm, startsAt: p.startsAt, venue: p.venue }));
  const fmt = new Intl.DateTimeFormat(lang === "am" ? "am-ET" : "en-GB", { timeZone: "Africa/Addis_Ababa", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-xl font-bold">{t("pickEvent")}</h1>
      {list.length === 0 && <p className="text-white/70">{t("noEvents")}</p>}
      {list.map((e) => {
        const has = packs.some((p) => p.eventId === e.id);
        return (
          <div key={e.id} className="space-y-2 rounded-2xl bg-white/10 p-4">
            <p className="font-bold">{(lang === "am" ? e.titleAm : e.title) ?? e.title}</p>
            <p className="text-sm text-white/70">
              {fmt.format(new Date(e.startsAt))} · {e.venue}
            </p>
            <button
              className="min-h-12 w-full rounded-xl bg-tent-600 font-bold disabled:opacity-50"
              disabled={busy === e.id}
              onClick={async () => {
                setBusy(e.id);
                try {
                  await downloadPack(e.id);
                } catch {
                  if (!has) {
                    setBusy(null);
                    return;
                  }
                }
                onPick(e.id);
              }}
            >
              {busy === e.id ? t("downloading") : t("download")}
            </button>
          </div>
        );
      })}
      <button className="min-h-11 w-full text-sm text-white/60" onClick={onLogout}>
        {t("logout")}
      </button>
    </div>
  );
}

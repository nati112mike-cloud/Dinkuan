"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { currentQr, loadWallet, readWallet, type WalletTicket } from "@/lib/wallet";

const locale = (lang: Lang) => (lang === "am" ? "am-ET" : "en-GB");

/** F6-AC3: the in-app QR rotates every 30 seconds, from codes cached on the device. */
export function TicketView({ lang, ticketId, onBack }: { lang: Lang; ticketId: string; onBack?: () => void }) {
  const t = translator(lang);
  const [ticket, setTicket] = useState<WalletTicket | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [rotating, setRotating] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const cached = readWallet()?.tickets.find((x) => x.id === ticketId) ?? null;
    if (cached) setTicket(cached);
    loadWallet().then((r) => {
      const fresh = r.wallet?.tickets.find((x) => x.id === ticketId);
      if (fresh) setTicket(fresh);
    });
  }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    let last = "";
    const tick = async () => {
      const now = Date.now();
      setSecondsLeft(30 - (Math.floor(now / 1000) % 30));
      const qr = currentQr(ticket, now);
      if (!qr || qr.payload === last) return;
      last = qr.payload;
      setRotating(qr.rotating);
      setSvg(await QRCode.toString(qr.payload, { type: "svg", margin: 1, errorCorrectionLevel: "M" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ticket]);

  if (!ticket) return <div className="mx-auto mt-20 h-12 w-12 animate-spin rounded-full border-4 border-tent-200 border-t-tent-600" />;
  const title = (lang === "am" ? ticket.event.titleAm : ticket.event.titleEn) ?? ticket.event.titleEn;
  const when = new Intl.DateTimeFormat(locale(lang), { timeZone: "Africa/Addis_Ababa", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(ticket.event.startsAt));

  return (
    <div className="mx-auto max-w-sm space-y-4">
      {onBack ? (
        <button type="button" onClick={onBack} className="tap text-sm font-semibold text-tent-600">
          ← {t("tickets.title")}
        </button>
      ) : (
        <Link href="/tickets" className="text-sm font-semibold text-tent-600">
          ← {t("tickets.title")}
        </Link>
      )}
      <div className="overflow-hidden rounded-3xl bg-white shadow-lg ring-1 ring-tent-100">
        <div className="bg-tent-700 p-5 text-white">
          <p className="text-xs uppercase tracking-widest opacity-80">ድንኳን · {ticket.typeName}</p>
          <h1 className="mt-1 text-xl font-extrabold leading-tight">{title}</h1>
          <p className="mt-1 text-sm opacity-90">{when}</p>
          <p className="text-sm opacity-90">{ticket.event.venue}</p>
        </div>
        <div className="space-y-3 p-5 text-center">
          {ticket.status === "checked_in" ? (
            <p className="py-16 text-xl font-bold text-emerald-700">✓ {t("ticket.checkedIn")}</p>
          ) : (
            <>
              <p className="font-semibold">{t("ticket.show")}</p>
              <div className="mx-auto w-64" data-testid="ticket-qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="mx-auto h-1.5 w-64 overflow-hidden rounded-full bg-tent-100">
                <div className="h-full bg-tent-500 transition-all" style={{ width: `${rotating ? (secondsLeft / 30) * 100 : 100}%` }} />
              </div>
              <p className="text-xs text-stone-500">{rotating ? t("ticket.rotates") : t("ticket.static")}</p>
            </>
          )}
          <div className="border-t border-dashed border-tent-200 pt-3 text-sm">
            <p className="text-stone-500">{t("ticket.holder")}</p>
            <p className="font-bold">{ticket.holderName}</p>
            <p className="mt-1 font-mono text-xs text-stone-400">{ticket.id.slice(0, 8).toUpperCase()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

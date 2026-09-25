"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { translator, type Lang } from "@dinkuan/i18n";
import { TicketView } from "./TicketView";
import { loadWallet, type Wallet as WalletData, type WalletTicket } from "@/lib/wallet";

const locale = (lang: Lang) => (lang === "am" ? "am-ET" : "en-GB");

export function Wallet({ lang }: { lang: Lang }) {
  const t = translator(lang);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  // Tickets open in place (no page load), so the wallet works fully offline.
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadWallet().then((r) => {
      if (r.unauthenticated) {
        window.location.href = "/login?next=/tickets";
        return;
      }
      setWallet(r.wallet);
      setOffline(r.offline);
      setLoaded(true);
    });
  }, []);

  const now = Date.now();
  const isPast = (tk: WalletTicket) => new Date(tk.event.endsAt ?? tk.event.startsAt).getTime() < now;
  const list = (wallet?.tickets ?? []).filter((tk) => (tab === "past" ? isPast(tk) : !isPast(tk)));
  const fmt = new Intl.DateTimeFormat(locale(lang), { timeZone: "Africa/Addis_Ababa", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  if (open) return <TicketView lang={lang} ticketId={open} onBack={() => setOpen(null)} />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">{t("tickets.title")}</h1>
      {offline && <p className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-900">{t("tickets.offline")}</p>}
      <div className="grid grid-cols-2 rounded-2xl bg-white p-1 ring-1 ring-tent-100">
        {(["upcoming", "past"] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`tap rounded-xl font-semibold ${tab === k ? "bg-tent-600 text-white" : "text-stone-600"}`}>
            {t(`tickets.${k}`)}
          </button>
        ))}
      </div>
      {loaded && list.length === 0 && (
        <div className="space-y-3 py-10 text-center">
          <p className="text-stone-500">{t("tickets.none")}</p>
          <Link href="/events" className="font-semibold text-tent-600">
            {t("tickets.findEvents")} →
          </Link>
        </div>
      )}
      <ul className="space-y-3">
        {list.map((tk) => (
          <li key={tk.id}>
            <button type="button" onClick={() => setOpen(tk.id)} className="flex w-full gap-3 overflow-hidden rounded-2xl bg-white text-left ring-1 ring-tent-100">
              <img src={`${tk.event.posterUrl}?size=card`} alt="" className="h-28 w-24 object-cover" />
              <div className="flex-1 space-y-1 py-3 pr-3">
                <p className="font-bold leading-snug">{(lang === "am" ? tk.event.titleAm : tk.event.titleEn) ?? tk.event.titleEn}</p>
                <p className="text-sm text-tent-700">{fmt.format(new Date(tk.event.startsAt))}</p>
                <p className="text-sm text-stone-500">
                  {tk.typeName} · {tk.event.venue}
                </p>
                {tk.status === "checked_in" && <p className="text-xs font-semibold text-emerald-700">✓ {t("ticket.checkedIn")}</p>}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatBirr } from "@dinkuan/core";
import { translator, type Lang, type MessageKey } from "@dinkuan/i18n";
import { api, errorText, timeAgo } from "@/lib/client";
import type { ChatDTO, ChatMessageDTO } from "@/lib/chat";
import { Avatar } from "./Avatar";
import { ReportButton } from "./ReportButton";

/** F20-AC15: in-app chat between client and vendor, refreshed every few seconds. */
export function Chat({ lang, initial }: { lang: Lang; initial: ChatDTO }) {
  const t = translator(lang);
  const [convo, setConvo] = useState(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const r = convo.request;

  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const res = await api<ChatDTO>(`/api/conversations/${convo.id}`);
      if (res.ok) setConvo(res.data);
    }, 4000);
    return () => clearInterval(timer);
  }, [convo.id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [convo.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    const res = await api<ChatMessageDTO>(`/api/conversations/${convo.id}/messages`, { body: { text: body } });
    if (res.ok) {
      setConvo((c) => ({ ...c, messages: [...c.messages, res.data] }));
      setText("");
    } else setError(errorText(lang, res.code));
    setBusy(false);
  };

  const decline = async () => {
    if (!window.confirm(t("chat.declineConfirm"))) return;
    const res = await api(`/api/requests/${r.id}/decline`, { body: {} });
    if (res.ok) setConvo((c) => ({ ...c, request: { ...c.request, status: "cancelled" } }));
  };

  const name = convo.other?.displayName ?? "—";
  return (
    <div className="flex min-h-[calc(100dvh-200px)] flex-col gap-3">
      <div className="flex items-center gap-3">
        <Link href="/inbox" className="tap grid place-items-center text-xl" aria-label={t("inbox.title")}>
          ←
        </Link>
        {convo.other && (
          <Link href={convo.asVendor ? `/u/${convo.other.username}` : `/hire/v/${convo.other.username}`} className="flex min-w-0 items-center gap-2">
            <Avatar profile={convo.other} size={40} />
            <span className="truncate font-bold">{name}</span>
          </Link>
        )}
      </div>

      <section className="space-y-1 rounded-2xl bg-white p-3 text-sm ring-1 ring-tent-100" aria-label={t("chat.request")}>
        <p className="flex items-center justify-between">
          <span className="font-bold">
            📅 {r.eventDate} · {r.startTime}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "cancelled" ? "bg-stone-200 text-stone-600" : "bg-amber-100 text-amber-900"}`}>
            {t(`booking.${r.status}` as MessageKey)}
          </span>
        </p>
        <p>
          📍 {r.venue} · {r.eventType} · 👥 {r.guests}
        </p>
        {(r.budgetSantim !== null || r.packageName) && (
          <p className="text-stone-600">
            {r.packageName && `📦 ${t(`tier.${r.packageTier}` as MessageKey)} · ${r.packageName}`}
            {r.packageName && r.budgetSantim !== null && " · "}
            {r.budgetSantim !== null && `💰 ${t("chat.budget", { amount: formatBirr(r.budgetSantim) })}`}
          </p>
        )}
        {convo.asVendor && r.status === "requested" && (
          <div className="flex gap-2 pt-2">
            <p className="flex-1 text-xs text-stone-500">{t("chat.offersSoon")}</p>
            <button type="button" onClick={() => void decline()} className="tap rounded-xl px-3 text-sm font-semibold text-red-600 ring-1 ring-red-200">
              {t("chat.decline")}
            </button>
          </div>
        )}
      </section>

      {!convo.contactUnlocked && <p className="rounded-xl bg-tent-100 px-3 py-2 text-xs text-tent-800">🔒 {t("chat.maskNotice")}</p>}

      <ol className="flex-1 space-y-2" data-testid="messages">
        {convo.messages.length === 0 && <li className="py-4 text-center text-sm text-stone-500">{t("chat.empty")}</li>}
        {convo.messages.map((m) => (
          <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.mine ? "rounded-br-sm bg-tent-600 text-white" : "rounded-bl-sm bg-white ring-1 ring-tent-100"}`}>
              {m.removed ? (
                <p className="italic opacity-70">{t("message.removed")}</p>
              ) : (
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              )}
              <p className={`mt-0.5 text-[10px] ${m.mine ? "text-tent-100" : "text-stone-400"}`}>
                {timeAgo(m.createdAt, lang)}
                {m.masked && ` · 🔒 ${t("chat.masked")}`}
              </p>
              {!m.mine && !m.removed && <ReportButton lang={lang} targetType="message" targetId={m.id} label="report.message" className="text-stone-400" />}
            </div>
          </li>
        ))}
        <div ref={bottom} />
      </ol>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <form
        className="sticky bottom-[72px] flex gap-2 rounded-2xl bg-tent-50 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          className="tap min-w-0 flex-1 rounded-2xl border border-tent-200 bg-white px-4"
        />
        <button disabled={busy || !text.trim()} className="tap grid place-items-center rounded-2xl bg-tent-600 px-4 font-bold text-white disabled:opacity-50">
          {t("chat.send")}
        </button>
      </form>
    </div>
  );
}
